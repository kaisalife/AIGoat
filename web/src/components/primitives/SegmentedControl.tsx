import clsx from 'clsx'
import s from './SegmentedControl.module.css'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** 铺满一行（设置中心的 SegmentedControl 全宽）。 */
  block?: boolean
  /** 无障碍组名，如「主题」。 */
  label: string
  className?: string
}

/**
 * 分段控件：两三个互斥选项里挑一个（Chat/Trajectory、light/dark/system）。
 *
 * 选项超过四个就别用了——那时该是 Menu 或 Select。分段的价值在于
 * 「全都看得见」，一屏放不下这个价值就没了。
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  block = false,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={clsx(s.group, block && s.block, className)}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          disabled={opt.disabled}
          className={clsx(s.segment, opt.value === value && s.active)}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}