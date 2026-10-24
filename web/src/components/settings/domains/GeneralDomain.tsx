import { useEffect, useState } from 'react'
import s from './GeneralDomain.module.css'
import type { PermissionProfile } from '../../../bridge/client'
import { getClient } from '../../../bridge/session'
import { useShell } from '../../../store/shell'
import {
  SegmentedControl,
  SettingsField,
  SettingsSection,
  Switch,
  type SegmentedOption,
} from '../../primitives'
import {
  CONTENT_SIZE_MAX,
  CONTENT_SIZE_MIN,
  useSettingsStore,
} from '../useSettingsStore'
import type { UiPrefs } from '../../../bridge/client'

const THEME_OPTIONS: SegmentedOption<UiPrefs['theme']>[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

const DENSITY_OPTIONS: SegmentedOption<UiPrefs['density']>[] = [
  { value: 'comfortable', label: '宽松' },
  { value: 'compact', label: '紧凑' },
]

/**
 * 通用域：外观与发送行为。
 *
 * 这里的每一项都是**改完立刻生效**的，所以用 Switch/SegmentedControl 而不是
 * 表单 + 保存按钮：让用户改完再点一次保存，等于凭空多出一步确认。
 * （模型配置相反——它要重启连接，必须走显式提交。）
 */
export function GeneralDomain() {
  const prefs = useSettingsStore()
  const profiles = usePermissionProfiles()

  return (
    <>
      <SettingsSection title="外观" description="主题与字号只影响本机界面。">
        <SettingsField
          label="主题"
          hint="深色适合长时间编码；跟随系统会随 Windows 的深色模式切换。"
        >
          <SegmentedControl
            label="主题"
            options={THEME_OPTIONS}
            value={prefs.theme}
            onChange={(theme) => prefs.update({ theme })}
          />
        </SettingsField>

        <SettingsField
          label="内容字号"
          hint={`只改正文，不动按钮与菜单（${CONTENT_SIZE_MIN}–${CONTENT_SIZE_MAX}px）。`}
        >
          <ContentSizeStepper value={prefs.contentSize} onChange={(contentSize) => prefs.update({ contentSize })} />
        </SettingsField>

        <SettingsField label="密度" hint="紧凑模式一屏能放下更多内容。">
          <SegmentedControl
            label="密度"
            options={DENSITY_OPTIONS}
            value={prefs.density}
            onChange={(density) => prefs.update({ density })}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="发送行为">
        <SettingsField
          label="Enter 发送"
          hint={
            prefs.enterSends
              ? 'Enter 直接发送，Shift+Enter 换行。'
              : 'Enter 换行，Ctrl+Enter 发送。'
          }
        >
          <Switch
            label="Enter 发送"
            checked={prefs.enterSends}
            onChange={(enterSends) => prefs.update({ enterSends })}
          />
        </SettingsField>

        <SettingsField
          label="新会话默认权限档位"
          hint="新会话起用的审批档位；已有会话不受影响。"
        >
          <select
            value={prefs.defaultPermissionProfile ?? ''}
            onChange={(e) =>
              prefs.update({ defaultPermissionProfile: e.target.value || null })
            }
            disabled={profiles === null}
          >
            <option value="">跟随 codex 默认</option>
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id} disabled={!p.allowed}>
                {p.id}
                {p.description ? ` · ${p.description}` : ''}
              </option>
            ))}
          </select>
        </SettingsField>
      </SettingsSection>

      <p className="settings__hint">这些偏好存在 settings.json 的 ui 段，改动立即生效，无需重启。</p>
    </>
  )
}

/** 字号步进：10–22 逐级点。滑杆在这个范围里太容易跳过头。 */
function ContentSizeStepper({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <span className={s.stepper}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= CONTENT_SIZE_MIN}>
        −
      </button>
      <span className={s.value}>{value}px</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= CONTENT_SIZE_MAX}>
        +
      </button>
    </span>
  )
}

/** 权限档位来自 codex（`permissionProfile/list`），拿不到就置灰而不是留空。 */
function usePermissionProfiles(): PermissionProfile[] | null {
  const cwd = useShell((s) => s.cwd)
  const [profiles, setProfiles] = useState<PermissionProfile[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void getClient()
      .permissionProfiles(cwd || undefined)
      .then((list) => {
        if (!cancelled) setProfiles(list)
      })
      .catch((err) => {
        console.error('[GeneralDomain] 加载权限配置失败:', err)
        if (!cancelled) setProfiles([])
      })
    return () => {
      cancelled = true
    }
  }, [cwd])

  return profiles
}