/**
 * 线程级事件对会话列表的改动。
 *
 * 协议把会话状态变化都归到 `threadEvent` 一个通道里，用 `kind` 区分：
 * 状态点、标题变更、归档、取消归档、删除、回滚。这一层只做**列表与当前态**
 * 的增量修补；每种 kind 的判据见下面各自的注释。
 *
 * 放在回合分片旁边而不是连接分片，是因为它只在 ingest 里被调用；但它改的是
 * 列表状态，紧挨着 ingest 才读得懂「谁负责列表」的边界。
 */

import type { AgentEvent, ThreadStatusKind } from '../../bridge/types'
import { emptyTurnState } from '../turnState'
import { forgetDeletedThreads } from '../threadCleanup'
import { resyncBaseline } from './turnActions'
import type { GetShell, SetShell } from './types'

export function applyThreadEvent(
  set: SetShell,
  get: GetShell,
  event: Extract<AgentEvent, { type: 'threadEvent' }>,
): void {
  const { kind } = event.event
  const id = event.threadId
  if (!id) return

  switch (kind) {
    case 'statusChanged': {
      const status = event.event.statusType
        ? { type: event.event.statusType as ThreadStatusKind, activeFlags: event.event.activeFlags }
        : undefined
      patchStatus(set, id, status)
      return
    }
    case 'renamed':
      patchTitle(set, id, event.event.threadName)
      return
    case 'archived':
    case 'unarchived':
    case 'deleted':
      moveBetweenLists(set, get, id, kind)
      return
    case 'reverted':
      handleReverted(set, get, id)
      return
    default:
      // closed 等其余 kind 与列表无关，忽略即可。
  }
}

/**
 * 会话历史被回滚（`thread/reverted`）。
 *
 * 协议载荷只有 `{ threadId }`，**没有游标、没有回合信息**
 * （见 `ThreadRevertedNotification`），所以本地没有任何办法增量修补——只能重拉
 * 基线整段替换。
 *
 * 用户自己点的回滚走 `threadMutations.revert`，它已经调过 `resumeThread`；
 * 通知随后到达只是再确认一次，`resyncBaseline` 幂等。
 */
function handleReverted(set: SetShell, get: GetShell, id: string): void {
  if (get().activeThreadId === id) {
    void resyncBaseline(set, get)
    return
  }
  if (!get().snapshots.get(id)) return
  // 子代理线程：快照记的是被回滚掉的那段历史，留着就是展示不存在的对话。
  // 丢掉之后那个 tab 会是空的——那是事实（我们手上没有它的内容了），
  // 所以提示只在这个**确实丢掉了什么**的时候给。
  const snapshots = new Map(get().snapshots)
  snapshots.delete(id)
  const snapshotClock = new Map(get().snapshotClock)
  snapshotClock.delete(id)
  set({
    snapshots,
    snapshotClock,
    hint: '某个子代理会话的历史已被回滚，它的实时记录已失效。',
  })
}

/**
 * 在活跃列表与归档区之间搬运会话；`deleted` 则两边都摘掉。
 *
 * 两边都查 `row`：事件到达时会话可能已被本地乐观更新搬过一遍，只在
 * `threadList` 里找会把它当成"不在列表里"而丢下不动。
 */
function moveBetweenLists(
  set: SetShell,
  get: GetShell,
  id: string,
  kind: 'archived' | 'unarchived' | 'deleted',
): void {
  const s = get()
  // 删除先清壳内残留，再判"行在不在列表里"：服务端删的是**整棵子树**，
  // 子代理线程可能压根不在我们的列表里，但它们照样在 ui-state 里留过条目。
  if (kind === 'deleted') forgetDeletedThreads([id])
  const inActive = s.threadList.find((x) => x.id === id)
  const inArchived = s.archivedList.find((x) => x.id === id)
  const row = inActive ?? inArchived
  if (!row) return

  // 已经在那张列表里就别再追加一份：重复通知（本地已搬过 + 服务端回执）
  // 在这里必须幂等，否则列表里会出现两行同一个会话。
  const threadList =
    kind === 'unarchived'
      ? inActive
        ? s.threadList
        : [...s.threadList, row]
      : s.threadList.filter((x) => x.id !== id)

  // 只有 `archived` 会往归档区加；`unarchived` 与 `deleted` 都是移除。
  const archivedList =
    kind === 'archived'
      ? inArchived
        ? s.archivedList
        : [...s.archivedList, row]
      : s.archivedList.filter((x) => x.id !== id)

  // 当前会话被归档或删除（取消归档不算，它仍然是打开着的那个）时清回合态：
  // 只置空 `activeThreadId` 的话 busy 还是 true、消息流还挂着那个会话，
  // 而它已经不在活跃列表里了。判定与 `forgetThreads` 对齐。
  const closing = kind !== 'unarchived' && s.activeThreadId === id
  set({
    threadList,
    archivedList,
    activeThreadId: closing ? null : s.activeThreadId,
    currentTurnId: closing ? null : s.currentTurnId,
    turnStatus: closing ? null : s.turnStatus,
    turn: closing ? emptyTurnState() : s.turn,
  })
}

/**
 * 就地更新一个会话的状态。
 *
 * 两侧都改：会话可能在归档区里改状态，而归档区是常驻的。只改 `threadList`
 * 的话它会一直显示旧状态，直到下次重拉列表才对。
 */
function patchStatus(
  set: SetShell,
  id: string,
  status: { type: ThreadStatusKind; activeFlags?: string[] } | undefined,
): void {
  set((state) => ({
    threadList: state.threadList.map((t) => (t.id === id ? { ...t, status } : t)),
    archivedList: state.archivedList.map((t) => (t.id === id ? { ...t, status } : t)),
  }))
}

/** 就地改标题（`thread/name/updated`）。两侧都改，理由同 `patchStatus`。 */
function patchTitle(set: SetShell, id: string, name: string | null | undefined): void {
  if (name === null || name === undefined) return
  set((state) => ({
    threadList: state.threadList.map((t) => (t.id === id ? { ...t, preview: name } : t)),
    archivedList: state.archivedList.map((t) => (t.id === id ? { ...t, preview: name } : t)),
  }))
}