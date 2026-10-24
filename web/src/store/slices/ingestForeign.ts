/**
 * 非当前线程的事件路由（09 号板块）。
 *
 * 单独成文件是因为它是 ingest 里**唯一带策略**的一段：`ingest` 本身是
 * 「把事件变成条目」，而这里是「这个事件该不该进当前会话」。
 */

import { getClient } from '../../bridge/session'
import type { AgentEvent } from '../../bridge/types'
import { applyEvent } from '../reducer'
import { runClientTool } from '../runClientTool'
import { rememberSnapshot } from '../snapshots'
import { useTerminals } from '../terminals'
import { emptyTurnState } from '../turnState'
import type { GetShell, SetShell } from './types'

/**
 * 分三类处理：
 *
 * - 与线程无关的（终端输出、目标）→ 走它们自己的 store，本来就不分线程
 * - 纯展示的（正文 / 工具 / 推理）→ 进那个线程的快照
 * - 必须应答的（审批 / 客户端工具 / 提问）→ 见下面那段说明
 */
export function ingestForeign(
  set: SetShell,
  get: GetShell,
  event: AgentEvent,
  owner: string,
): void {
  if (event.type === 'terminalEvent') {
    useTerminals.getState().ingest(event)
    return
  }
  // 目标条只显示当前会话的，别线程串味
  if (event.type === 'goalEvent') return

  // 必须应答的三类（见 snapshots.ts 的 mustAnswer）：工具 / 提问 / MCP。
  //
  // 「应答」和「有条目」是两件事，缺一不可：
  //   - 应答 → 不回的话子代理那一轮永久卡死
  //   - 条目 → 用户得能在那个会话里看到"发生过什么、我们答了什么"
  //
  // 曾经这三支都在建条目之前就 return 了：应答照发（子代理不会被卡死），
  // 但界面上什么都不留。现在统一先落条目再应答。
  if (event.type === 'toolCallRequested') {
    pushSnapshot(set, get, owner, event)
    void runClientTool(set, get, event, owner)
    return
  }
  if (event.type === 'approvalRequested') {
    pushSnapshot(set, get, owner, event)
    answerOrComplain(set, () =>
      getClient().respondApproval(event.requestId, 'decline'),
    )
    set({ hint: '子代理请求的权限已被自动拒绝——切到那个会话可以自己处理。' })
    return
  }
  if (event.type === 'userInputRequested') {
    pushSnapshot(set, get, owner, event)
    answerOrComplain(set, () => getClient().respondUserInput(event.requestId, {}))
    set({ hint: '子代理的提问已按「跳过」应答。' })
    return
  }
  if (event.type === 'elicitationRequested') {
    pushSnapshot(set, get, owner, event)
    answerOrComplain(set, () =>
      getClient().respondElicitation(event.requestId, { action: 'decline' }),
    )
    return
  }

  // 其余是纯展示的：只进那个线程的快照，不动主会话
  pushSnapshot(set, get, owner, event)
}

/** 把一条事件投影进 `owner` 那个线程的快照。 */
function pushSnapshot(set: SetShell, get: GetShell, owner: string, event: AgentEvent): void {
  const previous = get().snapshots.get(owner) ?? emptyTurnState()
  const next = applyEvent(previous, event)
  const { snapshots, clock } = rememberSnapshot(get().snapshots, get().snapshotClock, owner, next)
  set({ snapshots, snapshotClock: clock })
}

/**
 * 自动应答必须**看得见地失败**。
 *
 * 应答请求发不出去时，子代理那一轮就永久卡死——而界面上还留着一条
 * 「已自动拒绝」的提示在骗人。所以失败要如实报出来，而不是让 `void` 把它
 * 变成一个没人看的 unhandled rejection。
 */
function answerOrComplain(set: SetShell, send: () => Promise<void>): void {
  void send().catch((err: unknown) => {
    set({
      hint: `子代理请求的自动应答失败：${err instanceof Error ? err.message : String(err)}`,
    })
  })
}