/**
 * 置顶与手工排序的纯函数（03 号会话列表增强）。
 *
 * 单独成文件是因为它们是**纯计算**：不碰 store、不发请求，只按规则重排列表。
 * 混在 slice 里会让"哪些是规则、哪些是副作用"分不清——而这两者混在一处的
 * 典型后果就是把某个规则顺手改成了副作用。
 */

import type { ThreadSummary } from '../bridge/types'

/**
 * 当前的手工顺序。
 *
 * 用户没排过序（`threadOrder` 为空）时用列表现状当顺序——这样第一次拖拽
 * 就能落盘一份**完整**顺序，而不是只记"移动了这一条"（那会让其余会话的
 * 相对位置永远定不下来）。
 */
export function currentOrder(list: ThreadSummary[], order: string[]): string[] {
  return order.length > 0 ? order : list.map((t) => t.id)
}

/**
 * 按置顶 + 手工顺序给列表排序。
 *
 * 置顶在前（组内保持手工顺序），其余按手工顺序；`order` 里没有的会话
 * （比如刚由别的窗口建的）追加到末尾，保持列表里的相对次序。
 *
 * `pinned` 同时回写到条目上：行组件要靠它决定显示不显示置顶图标。
 */
export function applyPinned(
  list: ThreadSummary[],
  pinned: string[],
  order: string[] = list.map((t) => t.id),
): ThreadSummary[] {
  const rank = new Map(order.map((id, i) => [id, i]))
  const sorted = [...list].sort((a, b) => {
    const pa = pinned.includes(a.id) ? 0 : 1
    const pb = pinned.includes(b.id) ? 0 : 1
    if (pa !== pb) return pa - pb
    return (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  })
  return sorted.map((t) => ({ ...t, pinned: pinned.includes(t.id) }))
}

/** 置顶 / 取消置顶后的新列表。`order` 是要一并落盘的那份手工顺序。 */
export function togglePinned(
  list: ThreadSummary[],
  pinned: string[],
  id: string,
  order: string[] = list.map((t) => t.id),
): { pinned: string[]; list: ThreadSummary[] } {
  const next = pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id]
  return { pinned: next, list: applyPinned(list, next, order) }
}

/**
 * 拖拽重排后的新顺序。
 *
 * 下标越界直接返回原顺序：拖拽事件在边界上偶尔会给出等于长度的下标，
 * 那时"什么都不做"比"删掉一项再插到末尾"更符合直觉。
 */
export function reorderIds(order: string[], from: number, to: number): string[] {
  if (from < 0 || from >= order.length || to < 0 || to >= order.length || from === to) {
    return order
  }
  const next = [...order]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return order
  next.splice(to, 0, moved)
  return next
}

/** 把已删会话从置顶/顺序里摘掉。不摘的话那份 id 列表会一直涨。 */
export function pruneIds(ids: string[], gone: string[]): string[] {
  if (gone.length === 0) return ids
  const dead = new Set(gone)
  return ids.filter((x) => !dead.has(x))
}