/**
 * 会话与工作区状态 + 动作分派（03 号会话列表增强）。
 *
 * 这个 slice 只做两件事：持有会话相关状态、把动作指向 `threadOps` 里的实现。
 * 实现里有守卫与顺序要求，都搬到那边去了——这里保持成一张能一眼看完的表。
 */

import {
  applyPinned,
  currentOrder,
  pruneIds,
  reorderIds,
  togglePinned,
} from '../threadOrder'
import type { Slice, ThreadsKeys } from './types'
import * as ops from './threadOps'
import { forkThread, revert } from './threadMutations'

export const threadsSlice: Slice<ThreadsKeys> = (set, get) => ({
  threadList: [],
  archivedList: [],
  activeThreadId: null,
  pinnedThreads: [],
  threadOrder: [],

  threads: () => get().threadList,
  refreshThreads: () => ops.refreshThreads(set, get),
  setWorkspace: (path) => ops.setWorkspace(set, get, path),
  newThread: () => ops.newThread(set, get),
  resumeThread: (id) => ops.resumeThread(set, id),
  archiveThread: (id) => ops.archiveThread(set, get, id),
  unarchiveThread: (id) => ops.unarchiveThread(set, get, id),
  deleteThread: (id) => ops.deleteThread(set, get, id),
  deleteThreads: (ids) => ops.deleteThreads(set, get, ids),
  renameThread: (id, name) => ops.renameThread(set, get, id, name),
  compactThread: (id) => ops.compactThread(set, id),
  clearTurn: () => ops.clearTurn(set),
  fork: (id) => forkThread(set, get, id),
  revert: (id, beforeTurnId) => revert(set, get, id, beforeTurnId),

  forgetThreads(ids) {
    const s = get()
    // 被删会话的 id 要从置顶/顺序里一起清掉，否则那份列表会只增不减。
    const pinned = pruneIds(s.pinnedThreads, ids)
    const order = pruneIds(s.threadOrder, ids)
    ops.forgetThreads(set, get, ids)
    if (pinned !== s.pinnedThreads || order !== s.threadOrder) {
      set({ pinnedThreads: pinned, threadOrder: order })
      void ops.persistOrder(set, pinned, order)
    }
  },

  /**
   * 置顶 / 取消置顶。
   *
   * 置顶的会话**同时**钉在列表顶部且不受时间分组影响——它与「进行中」分组
   * 是两回事：置顶是用户手动表达「这几个我常看」，进行中是机器判断的
   * 「这几个在跑」。两个都叫「上面」，但只有前者是用户的决定。
   */
  togglePin(id) {
    const s = get()
    const order = currentOrder(s.threadList, s.threadOrder)
    const { pinned, list } = togglePinned(s.threadList, s.pinnedThreads, id, order)
    // 落盘的顺序必须是**刚应用的那份**：之前落的是旧 threadOrder（常为空），
    // 重载后 applyPinned 退回列表现状，用户看到的置顶排序就和界面不一样了。
    set({ pinnedThreads: pinned, threadList: list, threadOrder: order })
    void ops.persistOrder(set, pinned, order)
  },

  /**
   * 拖拽重排：**按 id 定位**。
   *
   * 列表是按时间分组渲染的，分组里的下标是组内下标、不是全局顺序。用下标
   * 调用会把错位的会话搬走并落盘一份错误的顺序（跨分组拖动更是直接失效）。
   */
  reorderById(fromId, toId) {
    const s = get()
    const order = currentOrder(s.threadList, s.threadOrder)
    const from = order.indexOf(fromId)
    const to = order.indexOf(toId)
    if (from < 0 || to < 0 || from === to) return
    const next = reorderIds(order, from, to)
    // 越界时 reorderIds 原样返回 —— 那就不该落盘一份没变的顺序。
    if (next === order) return
    set({ threadOrder: next, threadList: applyPinned(s.threadList, s.pinnedThreads, next) })
    void ops.persistOrder(set, s.pinnedThreads, next)
  },
})