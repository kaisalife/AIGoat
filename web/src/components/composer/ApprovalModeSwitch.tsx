import clsx from 'clsx'
import { Menu } from '../primitives'
import { useSettingsStore } from '../settings/useSettingsStore'
import { profileHint } from '../../store/approvalPolicy'
import s from './ApprovalModeSwitch.module.css'

interface ApprovalMode {
  /** `null` = 不发 `approvalPolicy`，由 codex 用协议默认（on-request）。 */
  id: string | null
  short: string
  label: string
  danger?: boolean
}

const MODES: ApprovalMode[] = [
  {
    id: null,
    short: '默认',
    label: '默认（协议默认：沙箱内不问，越权才问）',
  },
  {
    id: 'workspace-write',
    short: '自动（沙箱内）',
    label: '自动：沙箱内的命令直接执行，越权才问',
  },
  {
    id: 'read-only',
    short: '只读',
    label: '只读：几乎不改文件，未知命令逐个问',
  },
  {
    id: 'read-only-with-network',
    short: '只读 + 网络',
    label: '只读 + 网络：每个未知命令都先问你',
  },
  {
    id: 'danger-full-access',
    short: '全部自动批准',
    label: '全部自动批准：不再逐个审批（危险）',
    danger: true,
  },
]

/**
 * 审批模式切换。
 *
 * `turn/start.approvalPolicy` 是**逐回合**字段，由
 * `approvalPolicyFor(ui.defaultPermissionProfile)` 算出——所以切这里就是
 * 切下一回合的审批行为。写回走 `useSettingsStore.update`（持久化到
 * settings.json 的 ui 段，不需要重启 codex），设置中心显示的也是同一个值，
 * 两处不会各说各话。
 */
export function ApprovalModeSwitch() {
  const profile = useSettingsStore((s) => s.defaultPermissionProfile)
  const current = MODES.find((m) => m.id === profile) ?? MODES[0]!

  return (
    <Menu
      width={320}
      side="top"
      trigger={
        <button
          type="button"
          className={clsx(s.switch, current.danger && s.danger)}
          title={`审批模式：${current.short}。点击切换`}
          aria-label={`审批模式：${current.short}。点击切换`}
        >
          <span aria-hidden="true">{current.danger ? '⚠' : '✓'}</span>
          审批：{current.short}
        </button>
      }
      groups={[
        {
          label: '审批模式',
          items: MODES.map((mode) => ({
            id: mode.id ?? 'default',
            label: mode.short,
            hint: mode.id === null ? undefined : profileHint(mode.id),
            danger: mode.danger,
            onSelect: () => {
              useSettingsStore.getState().update({ defaultPermissionProfile: mode.id })
            },
          })),
        },
      ]}
    />
  )
}
