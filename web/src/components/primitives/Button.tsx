import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'
import s from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** 忙碌态：转圈并禁用。标签保留宽度，避免按钮在异步期间左右跳。 */
  loading?: boolean
  /** 撑满一行宽度（表单里的提交按钮）。 */
  block?: boolean
  /** 只有图标、无文字标签——必须同时给 aria-label。 */
  iconOnly?: boolean
  children?: ReactNode
}

/**
 * 唯一的按钮控件。
 *
 * 四个变体对应四种语义强度，别新增第五个：想表达「弱一点」就用 ghost，
 * 想表达「危险」就用 danger，视觉上再加一层花样只会让选择变难。
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  block = false,
  iconOnly = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(s.button, s[variant], s[size], block && s.block, iconOnly && s.iconOnly, className)}
      {...rest}
    >
      {loading && <Spinner size={size === 'sm' ? 11 : 13} />}
      {iconOnly ? null : <span className={s.label}>{children}</span>}
    </button>
  )
}