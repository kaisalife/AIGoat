import clsx from 'clsx'
import type { ReactNode } from 'react'
import s from './TextShimmer.module.css'

export interface TextShimmerProps {
  /** 进行中的占位文字（工具名、正在生成的标题）。 */
  children: ReactNode
  /** 静止态渲染的宽度；省略则按内容自适应。 */
  width?: string
  className?: string
}

/**
 * 运行中流光：文字位置固定不变，只有明暗在流动。
 *
 * 用于工具卡的「正在执行」态。刻意**不用**会左右跑的骨架屏——
 * 那会让整行一直抖动，长时间运行比静止更累人。
 */
export function TextShimmer({ children, width, className }: TextShimmerProps) {
  return (
    <span
      className={clsx(s.shimmer, className)}
      style={width ? ({ width } as React.CSSProperties) : undefined}
    >
      {children}
    </span>
  )
}