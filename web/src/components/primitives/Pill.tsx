import clsx from 'clsx'
import type { ReactNode } from 'react'
import s from './Pill.module.css'

export type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export interface PillProps {
  tone?: PillTone
  children: ReactNode
  className?: string
  /** 前缀圆点，用于「有状态」的胶囊（沙箱就绪、连接状态）。 */
  dot?: boolean
}

/**
 * 胶囊标签：一段状态或类别的紧凑标记。
 *
 * 与 Tag 的分工：Pill 是圆头、用于状态（"运行中"、"已归档"）；
 * Tag 是方角、带描边、用于标识实体（文件名、模型名）。
 */
export function Pill({ tone = 'neutral', dot = false, children, className }: PillProps) {
  return (
    <span className={clsx(s.pill, s[tone], className)}>
      {dot && <span className={s.dot} />}
      {children}
    </span>
  )
}