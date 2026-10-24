import s from './Spinner.module.css'

export interface SpinnerProps {
  /** 直径（px）。默认跟随所在控件的字号档。 */
  size?: number
  /** 无障碍标签；纯装饰性场合传 null 让读屏软件跳过。 */
  label?: string | null
  className?: string
}

/**
 * 忙碌指示。一条转圈的弧，不做呼吸或脉冲——
 * 面板里常常同时有好几个，叠加的动效比动效本身更吵。
 */
export function Spinner({ size, label = '加载中', className }: SpinnerProps) {
  return (
    <span
      className={className ? `${s.spinner} ${className}` : s.spinner}
      style={size ? ({ '--ag-spinner-size': `${size}px` } as React.CSSProperties) : undefined}
      role={label ? 'status' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
    />
  )
}