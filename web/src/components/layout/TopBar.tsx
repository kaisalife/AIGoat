import { WorkspaceMenu } from './WorkspaceMenu'
import { Chip, Icon, TopBarActions } from './TopBarActions'
import type { WorkspaceSummary } from '../../bridge/client'

export interface TopBarProps {
  connected: boolean
  userAgent: string
  cwd: string
  workspaces: WorkspaceSummary[]
  workspaceActive: string | null
  workspaceLoading: boolean
  onPickWorkspace: () => void
  onActivateWorkspace: (path: string) => void
  onManageWorkspaces: () => void
  models: { id: string; displayName: string; isDefault: boolean }[]
  modelId: string
  onModelChange: (id: string) => void
  sandboxReady: boolean | null
  pendingApprovals: number
  onToggleLeft: () => void
  onToggleRight: () => void
  onToggleFiles: () => void
  leftOpen: boolean
  rightOpen: boolean
  filesActive: boolean
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onOpenResources: () => void
  onOpenSettings: () => void
}

/**
 * 顶栏：全局的东西都在这里——工作区、模型、连接状态、面板开关。
 *
 * 会话级的信息一律不在这里（见 ConversationHeader）：切换会话时顶栏
 * 不该有任何一行跟着变。
 *
 * 右侧那一簇拆到 `TopBarActions`，它与左半边不共享状态。
 */
export function TopBar(props: TopBarProps) {
  const {
    cwd,
    workspaces,
    workspaceActive,
    workspaceLoading,
    onPickWorkspace,
    onActivateWorkspace,
    onManageWorkspaces,
    sandboxReady,
    leftOpen,
  } = props

  return (
    <header className="topbar">
      <button
        className={'topbar__toggle' + (leftOpen ? ' is-on' : '')}
        onClick={props.onToggleLeft}
        title="折叠 / 展开会话侧栏（Ctrl+B）"
        aria-label="切换会话侧栏"
      >
        <Icon d="M3 4h18v16H3zM9 4v16" />
      </button>

      <div className="topbar__brand">
        <span className="topbar__logo">A</span>
        <div className="topbar__id">
          <span className="topbar__name">AgentZ</span>
          <span className="topbar__path truncate" title={cwd}>
            {cwd || '未打开工作区'}
          </span>
        </div>
      </div>

      <div className="topbar__center">
        {/* 工作区是会话的根，选择器放中间最显眼的位置；没有工作区时它就是入口。 */}
        <WorkspaceMenu
          workspaces={workspaces}
          active={workspaceActive}
          loading={workspaceLoading}
          onPick={onPickWorkspace}
          onActivate={onActivateWorkspace}
          onManage={onManageWorkspaces}
        />

        <Chip
          tone={sandboxReady === null ? 'neutral' : sandboxReady ? 'ok' : 'warn'}
          title={
            sandboxReady === null
              ? '沙箱状态未知'
              : sandboxReady
                ? '沙箱就绪'
                : '沙箱未配置，命令可能不受隔离'
          }
        >
          沙箱 {sandboxReady === null ? '—' : sandboxReady ? '就绪' : '未配置'}
        </Chip>
      </div>

      <TopBarActions
        connected={props.connected}
        userAgent={props.userAgent}
        pendingApprovals={props.pendingApprovals}
        theme={props.theme}
        filesActive={props.filesActive}
        rightOpen={props.rightOpen}
        onToggleTheme={props.onToggleTheme}
        onToggleFiles={props.onToggleFiles}
        onToggleRight={props.onToggleRight}
        onOpenResources={props.onOpenResources}
        onOpenSettings={props.onOpenSettings}
      />
    </header>
  )
}