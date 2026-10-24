import { useEffect, useMemo } from 'react'
import { AppDialogs } from './components/layout/AppDialogs'
import { AppFrame } from './components/layout/AppFrame'
import { CenterSlot } from './components/layout/CenterSlot'
import { LeftSlot } from './components/layout/LeftSlot'
import { RightSlot } from './components/layout/RightSlot'
import { StatusBarSlot } from './components/layout/StatusBarSlot'
import { TopBarSlot } from './components/layout/TopBarSlot'
import { useLayoutStore } from './components/layout/useLayoutStore'
import { useShellShortcuts } from './components/layout/shortcuts'
import { watchUiStateUnload } from './components/layout/uiStateChannel'
import { openDialog } from './store/dialogs'
import { useShell } from './store/shell'
import { toggleDockTab } from './components/dock/useDockStore'
import { ErrorBoundary } from './components/primitives/ErrorBoundary'

/**
 * 应用装配层。
 *
 * 只做三件事：把各槽摆进 AppFrame、接上快捷键、把浮层挂上。
 * 列宽与拖拽在 AppFrame，列宽规则在 columns.ts，主题与字号在 useSettingsStore，
 * 对话框开关在 store/dialogs——这里一行布局计算都没有，加新板块时几乎不用动它。
 */
export function App() {
  // 布局从 ui-state.json 读回（启动一次）；主题与字号由 main.tsx 在首屏前落。
  // 卸载时把还脏着的布局状态写下去。
  useEffect(() => {
    void useLayoutStore.getState().hydrate()
    return watchUiStateUnload()
  }, [])

  // 首次使用（一个自定义模型都没有）自动弹出设置。
  const connection = useShell((s) => s.connection)
  const needsSetup = useShell((s) => s.needsSetup)
  useEffect(() => {
    if (connection === 'ready' && needsSetup) openDialog('settings')
  }, [connection, needsSetup])

  useShellShortcuts(
    useMemo(
      () => ({
        'session.new': () => void useShell.getState().newThread(),
        'layout.toggleLeft': useLayoutStore.getState().toggleSidebar,
        'layout.toggleRight': useLayoutStore.getState().toggleRight,
        'dock.files': () => toggleDockTab('files'),
        'app.settings': () => openDialog('settings'),
        'turn.interrupt': () => void useShell.getState().interrupt(),
      }),
      [],
    ),
  )

  return (
    <ErrorBoundary>
      <AppFrame
        topbar={<TopBarSlot />}
        left={<LeftSlot />}
        center={<CenterSlot />}
        right={<RightSlot />}
        statusbar={<StatusBarSlot />}
        overlay={<AppDialogs />}
      />
    </ErrorBoundary>
  )
}