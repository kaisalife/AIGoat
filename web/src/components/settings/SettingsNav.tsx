import clsx from 'clsx'
import type { DomainId } from './domains'
import s from './SettingsNav.module.css'

export interface SettingsNavProps {
  domains: { id: DomainId; label: string; badge?: string | null }[]
  active: DomainId
  onSelect: (id: DomainId) => void
}

/**
 * 域导航（dsh 的设置左侧栏）。
 *
 * 窄屏（<640px）折叠成顶部横向 tab：面板宽度跟着视口走，
 * 固定侧栏会把内容挤到放不下。
 */
export function SettingsNav({ domains, active, onSelect }: SettingsNavProps) {
  return (
    <nav className={s.nav} aria-label="设置分类" role="tablist">
      {domains.map((domain) => (
        <button
          key={domain.id}
          type="button"
          role="tab"
          aria-selected={domain.id === active}
          className={clsx(s.item, domain.id === active && s.active)}
          onClick={() => onSelect(domain.id)}
        >
          <span className={s.label}>{domain.label}</span>
          {domain.badge ? <span className={s.badge}>{domain.badge}</span> : null}
        </button>
      ))}
    </nav>
  )
}