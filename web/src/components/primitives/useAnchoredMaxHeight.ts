/**
 * 底部锚定浮层的视口适配（移植自 dsh `ui-primitives/useAnchoredMaxHeight`）。
 *
 * 触发弹层（slash 菜单、popupSelect 这类）的**底边**由布局决定、与自身
 * 高度无关，所以它是向上生长的——只有顶边可能撞上视口。把设计高度上限
 * 钳到「底边到视口顶的剩余空间」即可。
 */
import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/** 浮层与视口顶边的安全距离下限（px）。 */
const MARGIN = 12

/**
 * 把底部锚定浮层的 max-height 钳进视口。
 * @param ref - 浮层元素；`current` 为 null（弹层关闭）时跳过测量。
 * @param cap - 设计高度上限 px（钳制永远不会超过它）。
 * @param signal - 重测触发器：传入会变的渲染状态，锚点移动（输入框长高）
 *   时重新适配；挂载期间 resize/scroll 也会重适配。
 * @param margin - 视口顶边距离下限 px；处于固定页头（会话头部）之下的
 *   调用方应把它抬高到页头高度之上。
 * @returns 内联使用的 max-height（px）。
 */
export function useAnchoredMaxHeight(
  ref: RefObject<HTMLElement>,
  cap: number,
  signal: unknown,
  margin: number = MARGIN,
): number {
  const [maxHeight, setMaxHeight] = useState(cap)
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    const fit = (): void => {
      setMaxHeight(Math.min(cap, Math.max(0, el.getBoundingClientRect().bottom - margin)))
    }
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('scroll', fit, true)
    return () => {
      window.removeEventListener('resize', fit)
      window.removeEventListener('scroll', fit, true)
    }
  }, [ref, cap, signal, margin])
  return maxHeight
}
