import clsx from 'clsx'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import s from './Modal.module.css'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** 标题下方的说明行。 */
  description?: ReactNode
  children: ReactNode
  /** 底部动作区。省略则不渲染 footer，关闭靠右上角 × 或 Esc。 */
  footer?: ReactNode
  /** 宽度档。设置中心用 wide（800px），确认框用 narrow。 */
  size?: 'narrow' | 'default' | 'wide' | 'full'
  /** 点击遮罩是否关闭。表单类模态传 false，免得误点丢输入。 */
  closeOnBackdrop?: boolean
  className?: string
  /** 内容区的额外 class。设置中心用它把内容区改成两栏布局（自带边距）。 */
  bodyClassName?: string
}

/**
 * 模态：所有全局面板（设置中心、工作区管理、确认框）的统一外壳。
 *
 * 行为约定（别在各个面板里重复实现）：
 * - Esc 关闭；打开时锁 body 滚动；焦点进面板、关闭时归还给触发元素
 * - 高度用 `min(800px, 90vh)` 封顶，内容区自己滚——面板再长也不顶出屏幕
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'default',
  closeOnBackdrop = true,
  className,
  bodyClassName,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // onClose 用 ref 持有：调用方普遍传内联箭头函数，把它放进依赖会让本
  // effect 在父组件每次渲染时重跑——重新抓焦点、重锁 body，正在填的表单
  // 焦点会被拽走。
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return

    // Focus trap：Tab 在面板内循环，不会跑到遮罩后面。
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }

    // 打开时把焦点送进面板；如果面板里有可聚焦元素，优先给第一个。
    const previous = document.activeElement
    const firstFocusable = panel.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    // rAF 句柄要能取消：模态在下一帧前就关掉时，回调会往已卸载的节点上 focus。
    const frame = requestAnimationFrame(() => {
      if (firstFocusable) firstFocusable.focus()
      else panel.focus()
    })

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey, true)
      // 关闭时把焦点还给触发元素。
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className={s.backdrop}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={clsx(s.panel, s[size], className)}
        role="dialog"
        aria-modal="true"
      >
        {title !== undefined && (
          <header className={s.header}>
            <div className={s.heading}>
              <h2 className={s.title}>{title}</h2>
              {description && <p className={s.description}>{description}</p>}
            </div>
            <Button variant="ghost" size="sm" iconOnly aria-label="关闭" onClick={onClose}>
              ×
            </Button>
          </header>
        )}
        <div className={clsx(s.body, bodyClassName)}>{children}</div>
        {footer && <footer className={s.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}