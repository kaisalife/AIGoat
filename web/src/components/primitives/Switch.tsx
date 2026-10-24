import clsx from 'clsx'
import s from './Switch.module.css'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** 无障碍名称，如「紧凑模式」。 */
  label: string
  disabled?: boolean
  className?: string
}

/**
 * 开关：一个立刻生效的布尔值。
 *
 * 什么时候不用它：改动需要「保存」才生效的场景（比如模型配置表单），
 * 那种地方用 Button + 提交。用开关表达「这里有个可改的布尔」会误导用户。
 */
export function Switch({ checked, onChange, label, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={clsx(s.switch, checked && s.on, className)}
      onClick={() => onChange(!checked)}
    >
      <span className={s.knob} />
    </button>
  )
}