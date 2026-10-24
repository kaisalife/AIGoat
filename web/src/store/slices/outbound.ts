/**
 * 发往 codex 的请求：发消息、追加指令、应答审批/提问/MCP。
 *
 * 与 `turns.ts` 分开是因为那边是**收**（每条事件都走的高频路径），这边是
 * **发**（低频、每次都要处理失败）。两类逻辑混在一个文件里时，失败回滚的
 * 那些分支会把真正要紧的事件收口挤到下面——而收口错了是全局的，发送失败
 * 只是这一轮。
 *
 * 这一层的三条不变式：
 *   1. 凡是**先本地定稿再发请求**的（应答类），失败必须把状态退回去；
 *      否则卡片收成"已批准"、按钮消失，而 codex 从未收到应答，那一轮永久
 *      挂着，用户还没有重试入口。
 *   2. 凡是插了**本地回显**的（send/steer），失败必须撤掉回显。
 *   3. 失败一律落到 `hint`，不静默吞掉。
 */

import { getClient } from '../../bridge/session'
import { dropEcho, echoUserMessage } from '../localEcho'
import { useDrafts } from '../drafts'
import { answerQuestion, resolveApproval, revertApproval } from '../reducer'
import * as ops from './threadOps'
import { policyForSend, sandboxForSend } from './turnActions'
import { describe, requireModelAndCwd, type GetShell, type SetShell } from './types'

/**
 * 把一条指令追加到**正在跑的**回合（steer，08 号板块）。
 *
 * 与开新回合的区别在服务端：`turn/steer` 带 `expectedTurnId` 前置条件，
 * 回合号对不上就整条请求失败——所以这里不能乐观地"先发再说"，必须传当前
 * turnId。附件（图片）不参与 steer：只有纯文本进 `input`。
 */
export async function steerNow(set: SetShell, get: GetShell, text: string): Promise<void> {
  const s = get()
  const trimmed = text.trim()
  if (!trimmed || !s.activeThreadId || !s.currentTurnId) return

  const echo = echoUserMessage(s.turn, trimmed)
  set({ turn: echo.state })
  try {
    await getClient().steer(
      s.activeThreadId,
      s.currentTurnId,
      [{ type: 'text', text: trimmed, text_elements: [] }],
      echo.clientMsgId,
    )
  } catch (err) {
    set({
      turn: dropEcho(echo.state, echo.clientMsgId),
      hint: `追加指令失败：${describe(err)}`,
    })
  }
}

/**
 * 发送。回合运行中**走 steer**，否则开新回合。
 *
 * 两者都要本地回显：用户得立刻看到自己刚发了什么。带上 `clientMsgId` 后，
 * codex 发回的正式 `userMessage` 会把它认领掉，不产生两条。
 */
export async function sendNow(set: SetShell, get: GetShell, text: string): Promise<void> {
  const s = get()
  if (s.turn.turnActive) return steerNow(set, get, text)
  if (requireModelAndCwd(set, s)) return

  // 附件（11 号板块）：正文 + 图片合成一个 `UserInput[]`。
  // **正文为空但有图时也允许发送**——「只发一张截图问这是什么」是这个应用
  // 最常见的用法之一，把它堵掉等于废掉一半的附件功能。
  const input = useDrafts.getState().buildInput(text)
  if (input.length === 0) return

  const echo = echoUserMessage(get().turn, text.trim())
  try {
    const threadId = await ops.ensureThread(set, get)
    const policy = policyForSend()
    const sandbox = sandboxForSend()
    await getClient().sendMessage(
      threadId,
      input,
      echo.clientMsgId || undefined,
      policy ?? undefined,
      sandbox ?? undefined,
    )
    set({ turn: echo.state })
    // 发送成功才清草稿：失败时图片还在，用户可以直接重试。
    useDrafts.getState().clear()
  } catch (err) {
    // 发不出去就把回显撤掉，并如实报错——留着一条 pending 更糟。
    set({
      turn: dropEcho(echo.state, echo.clientMsgId),
      hint: `发送失败：${describe(err)}`,
    })
  }
}

/**
 * 应答失败时把条目退回 pending。
 *
 * 没有这一步，卡片就停在"已批准"而 codex 从未收到应答：那一轮永久挂着，
 * 按钮也已经消失，用户连重试都做不到。见文件头不变式 1。
 */
function rollback(set: SetShell, get: GetShell, requestId: unknown, what: string, err: unknown) {
  set({
    turn: revertApproval(get().turn, requestId),
    hint: `${what}失败：${describe(err)}（已退回待处理，可重试）`,
  })
}

/**
 * 审批应答：先本地定稿（界面立刻响应），失败回滚。
 *
 * 定稿的另一半在 `turnStarted` 之后的 `serverRequestResolved`——那里只补
 * 「已应答」三个字，不再改判定。真正的判定权在本函数。
 */
export async function answerApproval(
  set: SetShell,
  get: GetShell,
  requestId: unknown,
  decision: 'approve' | 'decline',
): Promise<void> {
  const accept = decision === 'approve'
  set({ turn: resolveApproval(get().turn, requestId, accept ? 'approved' : 'declined') })
  try {
    await getClient().respondApproval(requestId, accept ? 'accept' : 'decline')
  } catch (err) {
    rollback(set, get, requestId, '审批应答', err)
  }
}

/** codex 反问用户（userInput / elicitation）的应答，失败同样回滚。 */
export async function answerUserInput(
  set: SetShell,
  get: GetShell,
  requestId: unknown,
  answers: Record<string, string>,
): Promise<void> {
  set({ turn: answerQuestion(get().turn, requestId, answers) })
  try {
    await getClient().respondUserInput(requestId, answers)
  } catch (err) {
    rollback(set, get, requestId, '提问应答', err)
  }
}

/** MCP 的应答形状由它自己的 schema 定，这里原样送。 */
export async function answerElicitation(
  set: SetShell,
  get: GetShell,
  requestId: unknown,
  content: unknown,
): Promise<void> {
  set({ turn: answerQuestion(get().turn, requestId, {}) })
  try {
    await getClient().respondElicitation(requestId, content)
  } catch (err) {
    rollback(set, get, requestId, 'MCP 应答', err)
  }
}
