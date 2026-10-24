/**
 * 会话列表的分组与过滤规则（03 号会话列表增强）。
 *
 * 单独成文件是因为它们是**纯函数**：不碰 store、不渲染。而列表组件里
 * 混着大量 JSX，纯逻辑夹在中间会让"这条为什么进「今天」组"这种问题
 * 需要翻过三层标记才能回答。
 */

import type { ThreadSummary } from '../../bridge/types'

export type Group = 'active' | 'today' | 'previous'

export const GROUP_LABEL: Record<Group, string> = {
  active: '进行中',
  today: '今天',
  previous: '更早',
}

/** 标题子串匹配。列表规模有限（limit 50），不需要 fuzzy。 */
export function filterThreads(list: ThreadSummary[], query: string): ThreadSummary[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (t) =>
      t.preview?.toLowerCase().includes(q) ||
      t.model?.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q),
  )
}

/** 会话按「进行中 / 今天 / 更早」分组，组内按时间倒序。 */
export function groupThreads(list: ThreadSummary[]): Record<Group, ThreadSummary[]> {
  const out: Record<Group, ThreadSummary[]> = { active: [], today: [], previous: [] }
  const startOfToday = new Date().setHours(0, 0, 0, 0)

  for (const t of list) {
    if (isBusy(t)) out.active.push(t)
    else if (t.updatedAt && t.updatedAt >= startOfToday) out.today.push(t)
    else out.previous.push(t)
  }

  const byTime = (a: ThreadSummary, b: ThreadSummary) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  out.active.sort(byTime)
  out.today.sort(byTime)
  out.previous.sort(byTime)
  return out
}

/**
 * 判断会话是否在跑。
 *
 * 现在有**真的**信号了：`status.type === 'active'`（协议给的状态）。
 * `preview` 为空那条推断降级成兜底——协议状态是权威的，但某些老会话
 * 没带 status 字段，那时仍要看一眼 preview。
 */
export function isBusy(t: ThreadSummary): boolean {
  if (t.status?.type === 'active') return true
  if (t.status?.type === 'systemError') return false
  return (t.preview ?? '').trim() === ''
}
