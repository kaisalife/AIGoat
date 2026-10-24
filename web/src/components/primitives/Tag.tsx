import clsx from 'clsx'
import type { ReactNode } from 'react'
import s from './Tag.module.css'

export type TagTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
export type TagSize = 'sm' | 'md'

export interface TagProps {
  tone?: TagTone
  size?: TagSize
  children: ReactNode
  className?: string
  /** 可点击形态（筛选器里的标签）。 */
  onClick?: () => void
  title?: string
}

/**
 * 标识标签：模型名、文件名、能力名。
 *
 * 方角 + 发丝描边，与 Pill 的圆头状态胶囊刻意区分：
 * 一个说「它现在怎么样」，一个说「它是什么」。
 */
export function Tag({ tone = 'neutral', size = 'md', onClick, className, title, children }: TagProps) {
  const cls = clsx(s.tag, s[tone], s[size], onClick && s.clickable, className)
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} title={title}>
        {children}
      </button>
    )
  }
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  )
}