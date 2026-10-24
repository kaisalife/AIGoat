/**
 * 最小确认对话框。
 *
 * 不复用 `window.confirm`：原生对话框在 WebView 里样式不可控、按钮文案是
 * 系统语言，而且"删工作区"这类操作需要二选一（仅移除 / 连会话一起删），
 * 原生对话框给不了。
 */

import type { ReactNode } from 'react'

export interface ConfirmDialogProps {
  title: string
  children: ReactNode
  /** 确认按钮文案。破坏性操作用「删除」。 */
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  /** 叠在另一个对话框之上（比如管理工作区里再确认删除）。 */
  stacked?: boolean
  onConfirm: () => void
  onCancel: () => void
  /** 额外的中列选项（比如删工作区时的二选一）。返回 null 表示不显示该列。 */
  middle?: ReactNode
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    title,
    children,
    confirmLabel = '确定',
    danger,
    busy,
    stacked,
    onConfirm,
    onCancel,
    middle,
  } = props

  return (
    <div
      className={'confirm' + (stacked ? ' confirm--stacked' : '')}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="confirm__panel">
        <h2 className="confirm__title">{title}</h2>
        <div className="confirm__body">{children}</div>
        <div className="confirm__actions">
          <button className="btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          {middle}
          <button
            className={'btn ' + (danger ? 'btn--danger btn--solid' : 'btn--primary')}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
