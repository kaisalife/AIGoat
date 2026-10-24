import clsx from 'clsx'
import { useId, useState, type ReactNode } from 'react'
import s from './DisclosureRow.module.css'

export interface DisclosureRowProps {
  /** 折叠时可见的一行摘要。 */
  summary: ReactNode
  /** 展开后的内容。 */
  children: ReactNode
  defaultOpen?: boolean
  /** 受控模式：给了就用它，不给则自管。 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** 右侧计数/元信息，不参与折叠逻辑。 */
  meta?: ReactNode
  className?: string
  /** 摘要区整体禁用点击（工具卡的输出还在流，不让误折叠）。 */
  locked?: boolean
}

/**
 * 折叠行：工具卡分组、面板区块、会话详情都用它。
 *
 * 默认**折叠**由调用方决定，这里不替用户猜。展开状态不落盘——
 * 折叠是当下的操作，不是偏好。
 *
 * # 折叠时**不渲染** children
 *
 * 只用 `hidden` 藏起来的话，DOM 还在：默认档位（1）下工具卡是折叠的，
 * 于是每条命令的完整输出、每处 diff 的整段渲染、每份 JSON 都常驻在 DOM 里
 * （长会话里这是很可观的内存与首帧开销）。这里改成折叠时不挂载 children，
 * 展开时才渲染——代价是收起后正文内部状态（如滚动位置）会丢，而正文本来
 * 就是内容、不是表单，可以接受。
 *
 * 空壳 div 仍保留：`aria-controls` 指向它，结构稳定，也不影响样式。
 */
export function DisclosureRow({
  summary,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  meta,
  className,
  locked = false,
}: DisclosureRowProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = controlledOpen ?? uncontrolled
  const bodyId = useId()

  const toggle = () => {
    if (locked) return
    const next = !open
    setUncontrolled(next)
    onOpenChange?.(next)
  }

  return (
    <div className={clsx(s.row, open && s.open, className)} data-open={open || undefined}>
      <button
        type="button"
        className={s.summary}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        disabled={locked}
      >
        <span className={s.chevron} aria-hidden="true" />
        <span className={s.label}>{summary}</span>
        {meta ? <span className={s.meta}>{meta}</span> : null}
      </button>
      <div id={bodyId} className={s.body} hidden={!open}>
        {open ? children : null}
      </div>
    </div>
  )
}