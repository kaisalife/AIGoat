/**
 * 浮层与视口顶边的安全距离（移植 dsh `overlay-top-margin.ts`）。
 *
 * 自绘窗口条（`--ag-frame-top-clearance`）占住视口最顶部一条，贴顶的
 * 浮层（菜单、提示）必须从它下面避开。
 * @param min - 浮层自己的视口边距下限（px）。
 * @returns `min` 与窗口条高度中的较大者。
 */
export function overlayTopMargin(min: number): number {
  const root = document.documentElement
  const clearance = Number.parseFloat(getComputedStyle(root).getPropertyValue('--ag-frame-top-clearance'))
  if (Number.isNaN(clearance)) return min
  return Math.max(min, clearance)
}
