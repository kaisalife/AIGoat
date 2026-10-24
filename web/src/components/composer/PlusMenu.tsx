import { Menu } from '../primitives'
import { openDialog } from '../../store/dialogs'
import { toggleDockTab } from '../dock/useDockStore'
import { useLayoutStore } from '../layout/useLayoutStore'
import { useResources } from '../../store/resources'
import { useSettingsStore } from '../settings/useSettingsStore'
import { useShell } from '../../store/shell'
import { useWorkspaces } from '../../store/workspaces'
import { profileHint } from '../../store/approvalPolicy'
import s from './PlusMenu.module.css'

export interface PlusMenuProps {
  onOpenGoal: () => void
  onCompact: () => void
  /** 没有工作区时大部分入口不可用——菜单里要说清楚，而不是让用户点了没反应。 */
  cwd: string
}

/**
 * 「+」聚合菜单（08 号板块 §3.3）。
 *
 * # 为什么每项 = 一条命令
 *
 * dsh 的 `+` 菜单和 `/` 弹层是同一份命令目录的两个入口。这一期每项
 * 直接调动作函数而不是走注册表——因为 `+` 里的项与 `/` 的项**并不重合**
 * （`+` 有"切换右栏"这种纯界面动作，没有斜杠命令形式）。
 * 等两边真的重合了再合流。
 *
 * dsh 的 Feedback 项按 18 号排除清单弃用。
 */
export function PlusMenu(props: PlusMenuProps) {
  const { onOpenGoal, onCompact, cwd } = props
  const modelOptions = useShell((s) => s.modelOptions())
  const modelId = useShell((s) => s.modelId)
  const profiles = useResources((s) => s.permissions)
  const defaultProfile = useSettingsStore((s) => s.defaultPermissionProfile)
  const setPrefs = useSettingsStore((s) => s.update)
  const toggleLeft = useLayoutStore((s) => s.toggleSidebar)
  const toggleRight = useLayoutStore((s) => s.toggleRight)
  const workspaceActive = useWorkspaces((s) => s.active)

  const needCwd = !cwd
  const noModel = modelOptions.length === 0

  return (
    <div className={s.dock}>
      <Menu
        width={240}
        trigger={
          <button type="button" className={s.trigger} aria-label="更多操作" title="更多操作">
            +
          </button>
        }
        groups={[
          {
            label: '这一轮',
            items: [
              { id: 'goal', label: '设置目标…', onSelect: onOpenGoal },
              {
                id: 'compact',
                label: '压缩上下文',
                hint: needCwd ? '需要工作区' : undefined,
                disabled: needCwd,
                onSelect: onCompact,
              },
            ],
          },
          {
            label: '模型与权限',
            items: [
              ...modelOptions.map((m) => ({
                id: `model:${m.id}`,
                label: m.displayName,
                hint: m.id === modelId ? '当前' : undefined,
                onSelect: () => useShell.getState().setModel(m.id),
              })),
              // 权限档位**列出真实档位**（与模型一样），而不是一个点了只把当前值
              // 再写一遍的「权限档位…」——那是个空操作，标签带「…」却什么都不打开。
              // `allowed === false` 的档位置灰不隐藏（隐藏会让用户以为功能不存在）。
              ...(profiles.length > 0
                ? profiles.map((p) => ({
                    id: `perm:${p.id}`,
                    label: p.id,
                    hint: p.id === defaultProfile ? '当前' : profileHint(p.id),
                    disabled: !p.allowed,
                    onSelect: () => void setPrefs({ defaultPermissionProfile: p.id }),
                  }))
                : [
                    {
                      id: 'permission',
                      label: '权限档位（不可用）',
                      disabled: true,
                      onSelect: () => {},
                    },
                  ]),
            ],
          },
          {
            label: '界面',
            items: [
              { id: 'left', label: '折叠 / 展开左栏', onSelect: toggleLeft },
              { id: 'right', label: '折叠 / 展开右栏', onSelect: toggleRight },
              {
                id: 'terminal',
                label: '打开终端',
                onSelect: () => toggleDockTab('terminal'),
              },
              {
                id: 'files',
                label: '打开文件面板',
                onSelect: () => toggleDockTab('files'),
              },
              { id: 'settings', label: '设置…', onSelect: () => openDialog('settings') },
              {
                id: 'workspace',
                label: '切换工作区…',
                hint: workspaceActive ? undefined : undefined,
                onSelect: () => openDialog('workspaces'),
              },
            ],
          },
        ]}
      />
      {noModel && <span className={s.warn}>没有可用模型</span>}
    </div>
  )
}