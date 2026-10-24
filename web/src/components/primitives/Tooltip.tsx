import clsx from 'clsx'
import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import s from './Tooltip.module.css'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  /** 要挂提示的单个子元素，必须能接 ref 与事件。 */
  children: ReactElement<Record<string, unknown>>
  content: ReactNode
  placement?: TooltipPlacement
  /** 触发延迟（ms）。密集工具条用 400 免得划过就闪。 */
  delay?: number
  className?: string
}

/**
 * 文字提示。
 *
 * 用 portal 挂到 body 并 `position: fixed`，所以不会被祖先的
 * `overflow: hidden` 裁掉——侧栏、消息流里到处是滚动容器，
 * 提示被裁掉是最常见的失效方式。
 *
 * 交互元素（按钮/链接）才需要提示；纯文字内容自带含义，别包。
 */
export function Tooltip({
  children,
  content,
  placement = 'top',
  delay = 200,
  className,
}: TooltipProps) {
  const id = useId()
  const anchor = useRef<HTMLElement | null>(null)
  const timer = useRef<number | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [])

  const hide = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setPos(null)
  }

  const show = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const box = anchor.current?.getBoundingClientRect()
      if (!box) return
      setPos(spot(box, placement))
    }, delay)
  }

  return (
    <>
      {cloneElement(children, {
        ref: anchor,
        'aria-describedby': pos ? id : undefined,
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
      } as Record<string, unknown>)}
      {pos !== null &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className={clsx(s.tooltip, s[placement], className)}
            style={{ left: pos.x, top: pos.y }}
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  )
}

/** 提示的最大宽度，与 Tooltip.module.css 里的 max-width 保持一致。 */
const MAX_WIDTH = 280

/**
 * 以视口坐标算提示位置，并夹在视口内——贴边的元素不能把提示顶出去。
 *
 * 居中类（top/bottom）靠 `transform: translateX(-50%)` 对齐，夹取时按最大宽度
 * 的一半留边：宁可离锚点远一点也不被裁掉。
 */
function spot(box: DOMRect, placement: TooltipPlacement): { x: number; y: number } {
  const gap = 8
  const edge = 8
  const half = MAX_WIDTH / 2
  let x = box.left + box.width / 2
  let y = box.top - gap
  if (placement === 'bottom') y = box.bottom + gap
  if (placement === 'left') {
    x = box.left - gap
    y = box.top + box.height / 2
  }
  if (placement === 'right') {
    x = box.right + gap
    y = box.top + box.height / 2
  }
  const marginX = placement === 'left' || placement === 'right' ? edge : half
  return {
    x: Math.max(marginX, Math.min(x, window.innerWidth - marginX)),
    y: Math.max(edge, Math.min(y, window.innerHeight - edge)),
  }
}