/**
 * 会话与工作区的动作实现（`threadsSlice` 只做分派）。
 *
 * 分开的原因：slice 只需知道「动作 → 实现」的对应；实现里的守卫
 */

import { getClient } from '../../bridge/session'
import { turnFromHistory } from '../reducer'
import { emptyTurnState } from '../turnState'
import { forgetDeletedThreads } from '../threadCleanup'
import { describe, guard, requireModelAndCwd, type GetShell, type SetShell } from './types'
export { forkThread, revert } from './threadMutations'

/** 落盘置顶与顺序。失败只提示不断流程——排序是锦上添花，不值得打断。 */
export function persistOrder(
  set: SetShell,
  pinned: string[],
  order: string[],
): Promise<void> {
  return getClient()
    .saveThreadOrder(pinned, order)
    .catch((err) => set({ hint: `排序未能保存：${describe(err)}` }))
}

/** 按当前工作区重拉两侧会话列表（未归档 + 已归档，协议里两者互斥）。 */
export async function refreshThreads(set: SetShell, get: GetShell): Promise<void> {
  const cwd = get().cwd
  try {
    const filter = cwd ? { cwd } : undefined
    const [threadList, archivedList] = await Promise.all([
      getClient().listThreads(filter),
      getClient().listThreads({ ...filter, archived: true }),
    ])
    set({ threadList, archivedList })
  } catch (err) {
    set({ hint: `读取会话列表失败：${describe(err)}` })
  }
}

/** 切换工作区：改 cwd → 重列会话 → 丢掉不属于新工作区的当前会话。 */
export async function setWorkspace(
  set: SetShell,
  get: GetShell,
  path: string | null,
): Promise<void> {
  set({ cwd: path ?? '', hint: null })
  await refreshThreads(set, get)
  const s = get()
  // 列表已按新工作区过滤：还开着的会话如果不在里面，说明它属于另一个工作区，
  // 继续留着会让用户在一个工作区里看到别的目录的会话。
  if (s.activeThreadId && s.threadList.some((t) => t.id === s.activeThreadId)) return
  set({
    activeThreadId: null,
    currentTurnId: null,
    turnStatus: null,
    turn: emptyTurnState(),
    hint: s.cwd ? null : '还没有打开工作区：点顶栏的工作区按钮选一个文件夹。',
  })
}

/** 新建会话。缺模型或缺工作区时给出对应提示并停手。 */
export async function newThread(set: SetShell, get: GetShell): Promise<void> {
  const s = get()
  if (requireModelAndCwd(set, s)) return
  const model = s.settings?.models.find((m) => m.id === s.modelId)
  const thread = await getClient().startThread(s.cwd, {
    model: s.modelId,
    modelProvider: model?.providerId,
  })
  set({
    activeThreadId: thread.id,
    threadList: [
      { id: thread.id, preview: '（新会话）', updatedAt: Date.now() },
      ...s.threadList,
    ],
    currentTurnId: null,
    turnStatus: null,
    turn: emptyTurnState(),
    hint: null,
  })
}

/** 正在恢复的会话 id：连点同一行（双击会连发两次 click）时忽略重复请求。 */
let resumingId: string | null = null

/** 打开并回放历史。单击会话行即走这里。 */
export async function resumeThread(set: SetShell, id: string): Promise<void> {
  // 同一会话正在恢复时忽略重复点击：双击 = 两次 click，不去重会并发多次
  // thread/resume，白白往返还可能把两次结果交错写回。
  if (resumingId === id) return
  resumingId = id
  try {
    await guard(set, '恢复会话', async () => {
      const thread = await getClient().resumeThread(id)
      set({
        activeThreadId: thread.id,
        currentTurnId: null,
        turnStatus: null,
        turn: turnFromHistory(thread.history),
      })
    })
  } finally {
    resumingId = null
  }
}

/**
 * 归档会话。
 *
 * 归档当前会话时必须把回合态一起清掉：只把 `activeThreadId` 置空的话，
 * `turnActive` 还是 true、`busy` 还是 true、消息流还挂着那个会话的内容，
 * 而它已经不在活跃列表里了——界面在显示一个"当前没有打开的会话"的运行态。
 * 判定跟着 `forgetThreads` 走，别各清各的。
 */
export async function archiveThread(set: SetShell, get: GetShell, id: string): Promise<void> {
  await guard(set, '归档会话', async () => {
    await getClient().archiveThread(id)
    const s = get()
    const moving = s.threadList.filter((t) => t.id === id)
    const closing = s.activeThreadId === id
    set({
      threadList: s.threadList.filter((t) => t.id !== id),
      archivedList: [...s.archivedList, ...moving],
      activeThreadId: closing ? null : s.activeThreadId,
      currentTurnId: closing ? null : s.currentTurnId,
      turnStatus: closing ? null : s.turnStatus,
      turn: closing ? emptyTurnState() : s.turn,
      hint: '已归档，可在归档区找回',
    })
  })
}

export async function unarchiveThread(set: SetShell, get: GetShell, id: string): Promise<void> {
  await guard(set, '取消归档', async () => {
    // 必须真的通知服务端。曾经这里只改本地列表，于是界面把会话显示回活跃区，
    // 而 codex 那边它仍是归档态——下一次 refreshThreads（切工作区、重连、
    // 手动刷新）会话就又弹回归档区。列表是投影，真源在服务端。
    await getClient().unarchiveThread(id)
    const s = get()
    const moving = s.archivedList.filter((t) => t.id === id)
    set({
      archivedList: s.archivedList.filter((t) => t.id !== id),
      threadList: [...s.threadList, ...moving],
    })
  })
}

/**
 * 删除会话。
 *
 * **不要**在这里先 interrupt。codex 拒删运行中的会话，而"先打断、等 200ms、
 * 再重试删除"这套兜底已经实现在 Rust 的 `delete_thread` 里
 * （`commands/delete.rs`），单个删除与批量删除**都走它**。
 *
 * 曾经这里给批量删除单独加过一次前端打断、单个却没有，看着像两个入口行为
 * 不一致，其实那只是前端层的重复实现——真正生效的一直是 Rust 那份，两个
 * 入口从来就一致。前端再来一次只会多一次往返、多发一次 interrupt，而且少了
 * 那个 `INTERRUPT_SETTLE`（中断是异步落地的，太快重试仍会被拒）。
 *
 * 判断"是否在跑"也该以服务端的 `active_turn()` 为准；前端的 `turnActive`
 * 只是投影，可能已过期。
 */
export async function deleteThread(set: SetShell, get: GetShell, id: string): Promise<void> {
  await guard(set, '删除会话', async () => {
    await getClient().deleteThread(id)
    forgetThreads(set, get, [id])
    set({ hint: '会话已删除' })
  })
}

/**
 * 批量删除。
 *
 * 逐个删、单个失败不影响其余的语义在 Rust 侧；前端只如实回报分组结果。
 */
export async function deleteThreads(set: SetShell, get: GetShell, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await guard(set, '批量删除会话', async () => {
    const result = await getClient().batchDeleteThreads(ids)
    forgetThreads(set, get, result.deleted)
    const firstError = result.failed[0]?.error ?? '未知错误'
    set({
      hint:
        result.failed.length === 0
          ? `已删除 ${result.deleted.length} 个会话`
          : `已删除 ${result.deleted.length} 个，${result.failed.length} 个失败：${firstError}`,
    })
  })
}

export async function renameThread(
  set: SetShell,
  get: GetShell,
  id: string,
  name: string,
): Promise<void> {
  await guard(set, '重命名', async () => {
    await getClient().renameThread(id, name)
    const s = get()
    const patch = (list: typeof s.threadList) =>
      list.map((t) => (t.id === id ? { ...t, preview: name } : t))
    set({ threadList: patch(s.threadList), archivedList: patch(s.archivedList) })
  })
}

export async function compactThread(set: SetShell, id: string): Promise<void> {
  await guard(set, '压缩上下文', async () => {
    await getClient().compactThread(id)
    // 压缩后历史被摘要，界面必须让用户知道。
    set({ hint: '已开始压缩上下文，完成后会收到提示' })
  })
}

/**
 * 从两侧列表摘掉已删除的会话，并清掉指向它们的当前态。
 *
 * 顺带把壳自己为这些会话写下的残留一起清掉：ui-state.json 的 dock 布局与
 * 恢复游标（`forgetDeletedThreads`），以及置顶/手工顺序（下面按 ids 摘）。
 * 不清的话配置文件只增不减——删得越多，残留越多；而且 dock 落盘是整段
 * 覆写，旧条目还会被写回去。清的理由与做法见 `store/threadCleanup.ts`。
 */
export function forgetThreads(set: SetShell, get: GetShell, ids: string[]): void {
  const gone = new Set(ids)
  const s = get()
  const killed = s.activeThreadId !== null && gone.has(s.activeThreadId)
  const kept = s.threadList.filter((t) => !gone.has(t.id))
  set({
    threadList: kept,
    archivedList: s.archivedList.filter((t) => !gone.has(t.id)),
    activeThreadId: killed ? null : s.activeThreadId,
    currentTurnId: killed ? null : s.currentTurnId,
    turnStatus: killed ? null : s.turnStatus,
    turn: killed ? emptyTurnState() : s.turn,
  })
  forgetDeletedThreads(ids)
}

/** 清空消息流。 */
/** 有当前会话就用，没有就现建一个（新会话带上当前选中的模型与提供商）。 */
export async function ensureThread(
  set: SetShell,
  get: GetShell,
): Promise<string> {
  const s = get()
  if (s.activeThreadId) return s.activeThreadId
  const model = s.settings?.models.find((m) => m.id === s.modelId)
  const thread = await getClient().startThread(s.cwd, {
    model: s.modelId,
    modelProvider: model?.providerId,
  })
  set({ activeThreadId: thread.id })
  return thread.id
}

export function clearTurn(set: SetShell): void {
  set({ turn: emptyTurnState() })
}