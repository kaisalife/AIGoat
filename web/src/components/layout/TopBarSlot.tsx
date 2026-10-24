import { TopBar } from './TopBar'
import { useLayoutStore } from './useLayoutStore'
import { useResolvedTheme, useSettingsStore } from '../settings/useSettingsStore'
import { openDialog } from '../../store/dialogs'
import { toggleDockTab, useDockLayout } from '../dock/useDockStore'
import { useResources } from '../../store/resources'
import { useShell } from '../../store/shell'
import { useWorkspaces } from '../../store/workspaces'

/**
 * 顶栏槽：自己连各个 store，开面板走全局对话框 store，所以一个 prop 都不用收。
 *
 * 拆它是因为 TopBar 的 prop 有二十多项，其中大半是 store 派生值。
 * 让 App 逐项转发只会让装配层变成数据搬运工——而这里正是「哪些东西
 * 是全局的」最容易看清的地方。
 *
 * 订阅一律逐字段选，不整取 shell store：整店订阅会让顶栏在每条流式 delta
 * （正文增量每帧都改 `turn`）上重渲染，而顶栏与回合内容毫无关系。
 * `pendingApprovals()` 这类派生值用函数式选择器取：它在每次 store 变化时
 * 重算，但只在**数值真的变了**时才让组件重渲染。
 */
export function TopBarSlot() {
  const connection = useShell((s) => s.connection)
  const userAgent = useShell((s) => s.userAgent)
  const cwd = useShell((s) => s.cwd)
  const models = useShell((s) => s.models)
  const modelId = useShell((s) => s.modelId)
  const setModel = useShell((s) => s.setModel)
  const pendingApprovals = useShell((s) => s.pendingApprovals())
  const activeThreadId = useShell((s) => s.activeThreadId)
  const workspaces = useWorkspaces()
  const sandboxReady = useSandboxReady()
  const theme = useResolvedTheme()
  const setTheme = useSettingsStore((s) => s.update)

  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed)
  const rightOpen = useLayoutStore((s) => s.rightOpen)
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar)
  const toggleRight = useLayoutStore((s) => s.toggleRight)

  // 文件树现在是 dock 的一个 tab，所以顶栏这个按钮的状态来自 dock 布局。
  const filesActive = useDockLayout(activeThreadId).active === 'files'

  return (
    <TopBar
      connected={connection === 'ready'}
      userAgent={userAgent}
      cwd={cwd}
      workspaces={workspaces.list}
      workspaceActive={workspaces.active}
      workspaceLoading={workspaces.loading}
      onPickWorkspace={() => void workspaces.pick()}
      onActivateWorkspace={(path) => void workspaces.activate(path)}
      onManageWorkspaces={() => openDialog('workspaces')}
      models={models}
      modelId={modelId}
      onModelChange={setModel}
      sandboxReady={sandboxReady}
      pendingApprovals={pendingApprovals}
      leftOpen={!sidebarCollapsed}
      rightOpen={rightOpen}
      filesActive={filesActive}
      onToggleLeft={toggleSidebar}
      onToggleRight={toggleRight}
      onToggleFiles={() => toggleDockTab('files')}
      theme={theme}
      onToggleTheme={() => setTheme({ theme: theme === 'dark' ? 'light' : 'dark' })}
      onOpenResources={() => toggleDockTab('skills')}
      onOpenSettings={() => openDialog('settings')}
    />
  )
}

/** 沙箱小标签读的是 resources store，和右栏同一份数据。 */
function useSandboxReady(): boolean | null {
  const status = useResources((s) => s.sandbox?.status)
  return status === undefined ? null : status === 'ready'
}
