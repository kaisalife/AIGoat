/**
 * 目标（Goal）的显示辅助（07 号板块）。
 *
 * 类型本身在 `bridge/types/core.ts`——它来自协议，不属于组件层。
 * 这里只放"怎么显示"的判断，和 store/组件都能用。
 */

import type { Goal, GoalStatus } from '../../bridge/types'

export type { Goal, GoalStatus }

/** 有目标（值得渲染目标条）的最小条件。 */
export function hasGoal(goal: Goal | null | undefined): boolean {
  return typeof goal?.objective === 'string' && goal.objective.trim().length > 0
}

/** 目标文本（带上限，供窄处显示）。 */
export function goalText(goal: Goal, max = 60): string {
  const text = (goal.objective ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** 毫秒 → `1m05s`。目标条的耗时显示。 */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  if (total < 60) return `${total}s`
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`
}