/**
 * 三栏列宽的常量与求解（抄 dsh `ui-layout/src/client/columns.ts`）。
 *
 * 集中在这里而不是散在各组件里，是为了让「中栏永不被挤掉」这条规则只有
 * 一处实现：拖拽、窗口缩放、恢复旧布局都必须走同一个求解。
 */

export const SIDEBAR_DEFAULT = 280
export const SIDEBAR_MIN = 200
export const SIDEBAR_MAX = 420
/** 折叠成的 rail 宽度（dsh 同值 56）。 */
export const RAIL_WIDTH = 56

/** 中栏下限：低于这个宽度消息流就没法读了，任何情况下都不让位。 */
export const CENTER_MIN = 420

export const RIGHTBAR_DEFAULT = 380
export const RIGHTBAR_MIN = 300
/** 右栏最多占视口的一半——否则中栏会被挤成一条缝。 */
export const RIGHTBAR_MAX_RATIO = 0.5

export interface ColumnWidths {
  left: number
  center: number
  right: number
}

export interface ColumnInput {
  viewport: number
  sidebar: number
  rightbar: number
  sidebarCollapsed: boolean
  rightOpen: boolean
}

/** 钳制到 [min, max]，顺手挡掉 NaN（坏配置的 JSON 会喂进来 NaN）。 */
export function clampWidth(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function computeColumns(input: ColumnInput): ColumnWidths {
  const { viewport, sidebar, rightbar, sidebarCollapsed, rightOpen } = input

  let left = sidebarCollapsed ? RAIL_WIDTH : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  let right = rightOpen
    ? clampWidth(rightbar, RIGHTBAR_MIN, Math.max(RIGHTBAR_MIN, viewport * RIGHTBAR_MAX_RATIO))
    : 0

  // 中栏优先：先压右栏，再压左栏——用户主动拖宽的右栏比默认宽度的左栏更值得保留。
  const room = viewport - CENTER_MIN
  if (left + right > room) {
    right = Math.max(0, right - (left + right - room))
    left = Math.max(RAIL_WIDTH, left - Math.max(0, left + right - room))
  }

  return { left, center: Math.max(0, viewport - left - right), right }
}

/** 右栏上限（随视口变），拖拽时用来钳制，避免拖出屏幕外找不回来。 */
export function rightbarMax(viewport: number): number {
  return Math.max(RIGHTBAR_MIN, Math.floor(viewport * RIGHTBAR_MAX_RATIO))
}