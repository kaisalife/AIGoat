import clsx from 'clsx'
import type { ReactNode } from 'react'
import s from './SettingsForm.module.css'

export interface SettingsFieldProps {
  label: ReactNode
  /** 标签下的说明行。 */
  hint?: ReactNode
  /** 就地错误。存在时盖掉 hint——同一处不该同时出现两种提示。 */
  error?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * 表单行：标签 + 控件 + 说明，三段式。
 *
 * 窄屏（<640px）自动落成单列：标签在上、控件在下。设置中心面板宽度
 * 是跟着视口走的，固定两列在窄窗口里会把输入框挤到放不下。
 */
export function SettingsField({ label, hint, error, children, className }: SettingsFieldProps) {
  return (
    <div className={clsx(s.field, className)}>
      <div className={s.labels}>
        <span className={s.label}>{label}</span>
        {error ? <span className={s.error}>{error}</span> : null}
        {!error && hint ? <span className={s.hint}>{hint}</span> : null}
      </div>
      <div className={s.control}>{children}</div>
    </div>
  )
}

export interface SettingsSectionProps {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
}

/** 域内的一组相关字段。一屏放不下时用折叠而非翻页。 */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section className={clsx(s.section, className)}>
      <header className={s.sectionHead}>
        <h3 className={s.sectionTitle}>{title}</h3>
        {description && <p className={s.sectionDesc}>{description}</p>}
      </header>
      <div className={s.fields}>{children}</div>
    </section>
  )
}