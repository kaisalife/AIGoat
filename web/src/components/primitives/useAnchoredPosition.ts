/**
 * 固定定位浮层的锚点定位（移植自 dsh `ui-primitives/useAnchoredPosition`）。
 *
 * portal 面板按锚点的视口矩形摆位，而锚点一滚动/缩放就失效了。这个 hook
 * 只负责这一件事：量锚点、按 side/align 偏移面板、把结果钳进视口，并在
 * scroll（capture 阶段，嵌套滚动容器也能抓到）、resize、以及面板自身尺寸
 * 变化时重算。
 *
 * 面板必须**隐藏挂载**（`visibility: hidden` 而不是不渲染）——首次测量
 * 发生在打开它的同一个 commit 里，钳制用的是实测尺寸，首帧就在最终位置，
 * 不会从零尺寸的猜测跳一下。
 */
import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'
import { overlayTopMargin } from './overlayTopMargin'

/** {@link useAnchoredPosition} 的入参。 */
export interface AnchoredPositionOptions {
  /** 面板是否已挂载并需要跟随锚点。 */
  open: boolean
  /** 锚点元素（触发器）。 */
  anchorRef: RefObject<HTMLElement | null>
  /** 浮层元素；钳制用它实测尺寸。 */
  panelRef: RefObject<HTMLElement | null>
  /** 面板挂在锚点哪条边：下方（`bottom`，默认）或上方（`top`）。 */
  side?: 'top' | 'bottom'
  /** 面板与锚点哪条边对齐：左缘（`start`，默认）或右缘（`end`）。 */
  align?: 'start' | 'end'
  /** `side` 指定的锚点边与面板之间保留的距离。 */
  gap: number
  /** 面板与视口各边保留的距离。 */
  margin: number
}

/**
 * 跟随锚点，返回面板的 fixed 坐标。
 * @returns 面板的 `left`/`top`；首次测量前返回 `null`（调用方先隐藏渲染）。
 */
export function useAnchoredPosition(options: AnchoredPositionOptions): CSSProperties | null {
  const { open, anchorRef, panelRef, side = 'bottom', align = 'start', gap, margin } = options
  const [position, setPosition] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      const panel = panelRef.current
      const width = panel?.offsetWidth ?? 0
      const height = panel?.offsetHeight ?? 0
      let left = align === 'end' ? rect.right - width : rect.left
      let top = side === 'top' ? rect.top - gap - height : rect.bottom + gap
      if (width > 0) left = Math.min(Math.max(left, margin), window.innerWidth - width - margin)
      // 顶边用 overlayTopMargin：自绘窗口条占着视口最顶部一条，浮层要从它下面避开
      if (height > 0) {
        top = Math.min(Math.max(top, overlayTopMargin(margin)), window.innerHeight - height - margin)
      }
      setPosition((current) =>
        current?.left === left && current.top === top ? current : { left, top },
      )
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    // 面板自身高度变化（条目增减）不伴随任何事件——不重算的话，靠近底缘的
    // 面板会越过它本应尊重的边距。ResizeObserver 缺失时（jsdom）跳过。
    const panel = panelRef.current
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && panel !== null) {
      observer = new ResizeObserver(place)
      observer.observe(panel)
    }
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchorRef, panelRef, side, align, gap, margin])
  return position
}
