/**
 * 事件流 → 消息流的组装（纯函数，不碰 React）。
 *
 * 这是前端最关键的一层：codex 发的是「过程事件」（增量、开始、结束），
 * 界面要的是「消息」。两者不是一一对应。
 *
 * 分片约定：按事件类别拆三个文件（text / tools / turn），本文件只做
 * 分派与收口。规则逐条对应 [04 板块文件](docs/04-消息流与回合.md)。
 */

import type { AgentEvent } from '../../bridge/types'
import type { HistoryEntry } from '../../bridge/client'
import type { ApprovalEntry, Entry } from '../entries'
import { emptyTurnState, type TurnState } from '../turnState'
import { nextPendingApproval } from './helpers'
import { applyText } from './text'
import { applyTool } from './tools'
import { applyTurn } from './turn'
import { applyNotice } from './notice'
import { applyQuestion } from './question'

export { nextId } from './helpers'
export { answerQuestion, countPendingQuestions } from './question'

/** 把一个事件应用到回合状态。返回新对象，不原地改。 */
export function applyEvent(state: TurnState, event: AgentEvent): TurnState {
  const at = Date.now()
  return (
    applyText(state, event, at) ??
    applyTool(state, event, at) ??
    applyTurn(state, event, at) ??
    applyQuestion(state, event, at) ??
    applyNotice(state, event, at) ??
    state
  )
}

/** 批量应用。回放历史时省掉一串无用的中间状态。 */
export function applyEvents(state: TurnState, events: AgentEvent[]): TurnState {
  return events.reduce(applyEvent, state)
}

/** 审批已应答时把卡片定稿。 */
export function resolveApproval(
  state: TurnState,
  requestId: unknown,
  decision: 'approved' | 'declined',
): TurnState {
  // 按 requestId 找，而不是读单一槽位：同时可能有多条审批在等，
  // 槽位只记得最后一条，先答的那条会因此永远停在 pending。
  const index = state.entries.findIndex(
    (e) => e.kind === 'approval' && e.requestId === requestId && e.state === 'pending',
  )
  if (index < 0) return state
  const target = state.entries[index] as ApprovalEntry
  const copy = state.entries.slice()
  copy[index] = {
    ...target,
    state: decision,
    decision: decision === 'approved' ? '已允许' : '已拒绝',
  }
  return { ...state, entries: copy, pendingApproval: nextPendingApproval(copy) }
}

/**
 * 把一条审批**退回 pending**——`resolveApproval` 的逆操作。
 *
 * 存在的唯一理由：应答是**乐观定稿**的（点一下就先把卡片收成一行灰字，
 * 界面立刻响应）。但应答本身是一次网络请求，它可能失败——这时如果不定稿，
 * 卡片会一直停在"已批准"，而 codex 那边从未收到应答，那一轮永久挂着，
 * 用户还没有任何重试的入口（按钮已经没了）。
 *
 * 所以失败时必须退回去，让用户能再点一次。
 */
export function revertApproval(state: TurnState, requestId: unknown): TurnState {
  const index = state.entries.findIndex(
    (e) =>
      (e.kind === 'approval' || e.kind === 'userInput' || e.kind === 'elicitation') &&
      e.requestId === requestId,
  )
  if (index < 0) return state
  const entry = state.entries[index] as ApprovalEntry
  if (entry.state === 'pending') return state

  const copy = state.entries.slice()
  copy[index] = { ...entry, state: 'pending', decision: undefined }
  return { ...state, entries: copy, pendingApproval: nextPendingApproval(copy) }
}

/** 切会话时清空消息流。保留 seq 会让新会话的 key 与旧会话重名。 */
export function resetTurnState(): TurnState {
  return emptyTurnState()
}

/** resume 回放的历史 → 消息流初始状态。 */
export function turnFromHistory(history: HistoryEntry[]): TurnState {
  // 历史回放全部算作同一个回合：没有 turnStarted 事件可依据，
  // 编造分段只会让 turn rail 上出现一排假的回合。
  const turn = 0
  const at = Date.now()
  const entries: Entry[] = []
  // 计划不进消息流，但要抬到 plan.draft —— 否则切会话后计划面板空白。
  // 取最后一条：计划是覆盖式的，后来的那份才是当前的。
  let planDraft = ''
  history.forEach((h, i) => {
    if (h.kind === 'plan') {
      if (h.text) planDraft = h.text
      return
    }
    const entry = historyEntry(h, { id: `hist-${i + 1}`, at: at + i, turn })
    if (entry) entries.push(entry)
  })
  const base = emptyTurnState()
  return {
    ...base,
    entries,
    turn: turn + 1,
    plan: planDraft ? { ...base.plan, draft: planDraft } : base.plan,
  }
}

type Stamp = { id: string; at: number; turn: number }

/** 历史条目 → 条目。未知种类返回 null：跳过，不塞占位。 */
function historyEntry(h: HistoryEntry, stamp: Stamp): Entry | null {
  switch (h.kind) {
    case 'user':
      return { ...stamp, kind: 'user', text: h.text }
    case 'assistant':
      return { ...stamp, kind: 'assistant', text: h.text, streaming: false }
    case 'reasoning':
      return { ...stamp, kind: 'reasoning', text: h.text, streaming: false }
    case 'tool':
      return {
        ...stamp,
        kind: 'tool',
        itemId: stamp.id,
        toolKind: h.toolKind,
        name: h.name,
        output: h.output,
        status: h.status,
        // 壳侧已经从 `commandExecution` 带出这两个了，别在这儿丢掉——否则
        // 切回会话后工具卡不再显示「exit 1」和耗时，而实时流里是显示的。
        exitCode: h.exitCode,
        durationMs: h.durationMs,
        streaming: false,
      }
    case 'plan':
      // 计划不进消息流，`turnFromHistory` 已经把它抬到 plan.draft 了。
      return null
    case 'fileEdit':
      return { ...stamp, kind: 'fileEdit', itemId: stamp.id, changes: h.changes, status: h.status }
    // 与 Rust `map/history.rs` 对齐的其余历史类型：不回放的话，切会话后
    // 这些内容会消失，而重连基线又会出现，两边不一致。
    case 'imageView':
      return { ...stamp, kind: 'imageView', path: h.path }
    case 'imageGeneration':
      return {
        ...stamp,
        kind: 'imageGeneration',
        status: h.status,
        revisedPrompt: h.revisedPrompt ?? null,
        result: h.result ?? null,
        savedPath: h.savedPath ?? null,
        failure: h.failure ?? null,
      }
    case 'notice':
      return { ...stamp, kind: 'notice', level: h.level, text: h.text }
    case 'compaction':
      return {
        ...stamp,
        kind: 'compaction',
        running: false,
        byUser: h.byUser,
        summarizedCount: h.summarizedCount,
      }
    case 'subAgent':
      return {
        ...stamp,
        kind: 'subAgent',
        agentThreadId: h.agentThreadId,
        agentPath: h.agentPath,
        activity: h.activity,
      }
    case 'reviewMode':
      return { ...stamp, kind: 'reviewMode', mode: h.mode, review: h.review }
    default:
      return null
  }
}