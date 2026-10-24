/**
 * 多线程快照（09 号板块 §3「store 事件按 threadId 路由」）。
 *
 * # 为什么需要它
 *
 * `agent-event` 那一条流里混着**所有线程**的事件：子代理在自己的线程里
 * 跑，它的事件同样从这条流上来。改造前的 `ingest` 不看 threadId，
 * 一律灌进唯一的 `turn` —— 于是子代理的思考、工具调用、正文会全部
 * 插进主会话的消息流。
 *
 * 而协议给了现成的分流依据：事件自带 `threadId`。所以**零新命令**，
 * 纯前端路由（09 号文件 §3 的结论：取"复用 agent-event 按 id 路由"那条）。
 *
 * # 内存
 *
 * 快照按线程各存一份完整的 TurnState，不设上限的话一个跑一天的会话
 * 能把几十个子线程的正文全留在内存里。所以只留**最近活跃的 5 个**
 * 非当前线程；再早的可以从账本回放重建（06 号板块的 `origin: 'history'`）。
 */

import type { TurnState } from './turnState'

/** 保留多少个非当前线程的快照。 */
export const MAX_SNAPSHOTS = 5

/** threadId → 该线程的消息流快照。 */
export type Snapshots = Map<string, TurnState>

/** threadId → 最近一次更新的时刻（毫秒）。用于淘汰最旧的快照。 */
export type SnapshotClock = Map<string, number>

/**
 * 记一次快照并淘汰过期的。
 *
 * 用「最近活跃」而不是「最先创建」淘汰：用户刚看过的一个子线程，
 * 哪怕创建得早，也比一个半小时前冒出来又没人看的更该留着。
 */
export function rememberSnapshot(
  snapshots: Snapshots,
  clock: SnapshotClock,
  threadId: string,
  turn: TurnState,
  now = Date.now(),
): { snapshots: Snapshots; clock: SnapshotClock } {
  const nextSnapshots = new Map(snapshots)
  nextSnapshots.set(threadId, turn)
  const nextClock = new Map(clock)
  nextClock.set(threadId, now)

  if (nextSnapshots.size > MAX_SNAPSHOTS) {
    const keys = Array.from(nextSnapshots.keys())
    const stale = keys
      .filter((key) => key !== threadId)
      .sort((a, b) => (nextClock.get(a) ?? 0) - (nextClock.get(b) ?? 0))
      .slice(0, keys.length - MAX_SNAPSHOTS)
    for (const key of stale) {
      nextSnapshots.delete(key)
      nextClock.delete(key)
    }
  }
  return { snapshots: nextSnapshots, clock: nextClock }
}

/**
 * 事件属于哪个线程。
 *
 * 返回 null 表示"不带 threadId 的全局事件"（`ready`、`threadEvent` 的
 * 线程级通知等），它们不属于任何一个具体线程，走全局处理。
 */
export function threadOf(event: { threadId?: unknown }): string | null {
  const id = event.threadId
  return typeof id === 'string' && id ? id : null
}

/**
 * 这类事件**必须应答**，与当前打开的是哪个线程无关。
 *
 * 分流的诱惑是"别的线程的事就丢一边"——但那会让子代理的审批请求
 * 永远悬着，那一轮就此卡死。所以它们照样应答，只是条目落到**发起方线程**
 * 的快照里，而不是主会话。
 */
export function mustAnswer(event: { type: string }): boolean {
  return (
    event.type === 'toolCallRequested' ||
    event.type === 'userInputRequested' ||
    event.type === 'elicitationRequested'
  )
}