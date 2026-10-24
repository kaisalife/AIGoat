import { lazy, Suspense, useEffect, useState } from 'react'
import { closeDialog, useDialogs } from '../../store/dialogs'
import { useWorkspaces } from '../../store/workspaces'

/**
 * 应用级对话框的挂载点。
 *
 * 开关状态在 `store/dialogs`，所以 App 不用往下传任何回调，各面板自己
 * `openDialog('settings')` 就行。
 *
 * 放浮层槽而不是就地渲染：模态要盖住整个窗口，在 AppFrame 的 overlay 位里
 * 最稳（primitives/Modal 自己还会 portal 到 body）。
 *
 * 这里只有两个：原先的「技能与钩子」对话框随 10 号板块退役了——那两块
 * 内容现在是 dock 的「技能」tab，顶栏按钮直接切过去，不需要再套一层模态。
 *
 * # 懒加载 + 首次打开才挂载
 *
 * 设置中心连同它的全部域是一块不小的代码，而冷启动根本不会打开它。
 * 这里改成 `lazy`，并且**首次打开后才挂载**——否则组件一渲染（哪怕
 * `open=false`）就会触发 `import()`，等于没省。首次挂载后一直留着，
 * 这样设置中心「上次停在哪一域」的记忆还在（`Modal` 关闭时返回 null，
 * 挂着不占画面）。
 */
const SettingsDialog = lazy(() =>
  import('../settings/SettingsDialog').then((m) => ({ default: m.SettingsDialog })),
)
const WorkspaceDialog = lazy(() =>
  import('./WorkspaceDialog').then((m) => ({ default: m.WorkspaceDialog })),
)

export function AppDialogs() {
  const workspaces = useWorkspaces()
  const settings = useDialogs((s) => s.settings)
  const dialogWorkspaces = useDialogs((s) => s.workspaces)

  // 首次打开后置真，此后一直挂载（保留各域自己的局部状态）。
  const [settingsMounted, setSettingsMounted] = useState(false)
  const [workspacesMounted, setWorkspacesMounted] = useState(false)
  useEffect(() => {
    if (settings) setSettingsMounted(true)
  }, [settings])
  useEffect(() => {
    if (dialogWorkspaces) setWorkspacesMounted(true)
  }, [dialogWorkspaces])

  return (
    <>
      {settingsMounted && (
        <Suspense fallback={null}>
          <SettingsDialog open={settings} onClose={() => closeDialog('settings')} />
        </Suspense>
      )}
      {workspacesMounted && (
        <Suspense fallback={null}>
          <WorkspaceDialog
            open={dialogWorkspaces}
            workspaces={workspaces.list}
            active={workspaces.active}
            busy={workspaces.loading}
            pendingRemoval={workspaces.pendingRemoval}
            onPick={() => void workspaces.pick()}
            onActivate={(path) => void workspaces.activate(path)}
            onReveal={(path) => void workspaces.reveal(path)}
            onAskRemove={workspaces.openRemove}
            onCancelRemove={workspaces.cancelRemove}
            onConfirmRemove={(withSessions) => void workspaces.confirmRemove(withSessions)}
            onClose={() => closeDialog('workspaces')}
          />
        </Suspense>
      )}
    </>
  )
}
