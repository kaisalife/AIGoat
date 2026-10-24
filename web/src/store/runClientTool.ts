/**
 * 客户端工具的执行器（05/12 号板块）。
 *
 * 单独成文件是因为它是"事件流 → 副作用"这条链上唯一有**异步**的一段：
 * `ingest` 本身必须同步返回（它只是把事件投影成条目），而执行工具要 await。
 * 混在 slice 里会让人以为 ingest 是异步的。
 */

import type { AgentEvent } from '../bridge/types'
import { executeClientTool } from './clientTools'
import type { Entry } from './entries'
import type { GetShell, SetShell } from './slices/types'
import { emptyTurnState } from './turnState'
import { rememberSnapshot } from './snapshots'

/**
 * 执行一个客户端工具并把结果写回消息流。
 *
 * 三种结局都要有界面状态：成功（输出可见）、失败（显示原因）、没注册
 * （明确告知宿主不支持）。最后一种最容易被漏掉——不写界面的话用户只
 * 看到一条永远转圈的卡片。
 *
 * # `owner`：结果写回哪个线程
 *
 * 省略 = 当前会话（写 `turn`）；给出 threadId = 写那个线程的**快照**。
 *
 * 这一条不是可选的细节：子代理的工具调用同样必须应答，但它的卡片在子代理
 * 自己的快照里。曾经这里一律写 `turn`，而主会话里根本没有对应的卡片
 * （卡片是被 `ingestForeign` 提前 return 掉的），于是那次 `map` 是空操作——
 * 工具真的跑了、结果真的回给 codex 了，而界面上一个字都没有。
 *
 * 调用方负责**先把卡片插进去**（`applyEvent`），这里只负责推进它的状态。
 */
export async function runClientTool(
  set: SetShell,
  get: GetShell,
  event: Extract<AgentEvent, { type: 'toolCallRequested' }>,
  owner?: string,
): Promise<void> {
  const id = `tcall-${String(event.requestId)}`
  const { ok, message } = await executeClientTool(event.requestId, event.tool, event.arguments)

  // 期间可能已经切了会话/回合，按 id 覆盖；找不到就说明这条已不在流里。
  const settle = (entry: Entry): Entry =>
    entry.id === id && entry.kind === 'toolCall'
      ? { ...entry, status: ok ? 'completed' : 'failed', output: message }
      : entry

  if (owner) {
    set((s) => {
      const current = s.snapshots.get(owner) ?? emptyTurnState()
      const next = { ...current, entries: current.entries.map(settle) }
      return rememberSnapshot(s.snapshots, s.snapshotClock, owner, next)
    })
    return
  }
  set({ turn: { ...get().turn, entries: get().turn.entries.map(settle) } })
}