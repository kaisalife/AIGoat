import clsx from 'clsx'
import s from './StateDot.module.css'

export type StateDotTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export interface StateDotProps {
  tone?: StateDotTone
  /**
   * 运行中。给一圈缓慢的呼吸光晕，表示「这一格还在动」。
   * 状态本身仍由 tone 决定——两者是独立的，不要用 tone=accent 代替 loading。
   */
  busy?: boolean
  /** 无障碍标签。省略则是纯装饰（相邻文字已说明状态）。 */
  label?: string
  size?: number
  className?: string
}

/**
 * 状态点：一个 8px 的圆点 + 可选呼吸光晕。
 *
 * 用来在密集列表里表示「这一行的状态」，比文字标签省地方得多；
 * 要读全称时旁边配 Pill 或 StateDot 的 label。
 */
export function StateDot({ tone = 'neutral', busy = false, label, size, className }: StateDotProps) {
  return (
    <span
      className={clsx(s.dot, s[tone], busy && s.busy, className)}
      style={size ? ({ '--ag-dot-size': `${size}px` } as React.CSSProperties) : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}