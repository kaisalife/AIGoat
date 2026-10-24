import { shallow } from 'zustand/shallow'
import { LeftColumn } from './LeftColumn'
import { SidebarRail } from './SidebarRail'
import { useLayoutStore } from './useLayoutStore'
import { openDialog } from '../../store/dialogs'
import { toggleDockTab } from '../dock/useDockStore'
import { useShell } from '../../store/shell'
import { useWorkspaces } from '../../store/workspaces'

/**
 * 左栏的两个形态（展开 / 56px rail）都从这里出。
 *
 * 折叠与展开共用一套回调，所以两边永远不会有「只有 rail 里能新建会话」
 * 这种能力差——rail 少放入口是刻意的，但功能不许缺（01 §2.2）。
 *
 * 左栏只有会话列表：文件树随 10 号板块搬去了 dock 的「文件」tab。
 *
 * # 订阅逐字段选
 *
 * 整店订阅（`useShell()`）会让左栏在**每条流式 delta** 上重渲染，而左栏
 * 只是会话列表——重渲染时 `ThreadList` 会重跑一遍过滤 / 分组 / 置顶排序，
 * 长会话下这是白白烧掉的 CPU。这里只订阅列表本身与会话游标（它们只在
 * 线程事件时变），动作引用在 store 生命周期内稳定，用一个 shallow 选择器取。
 */
export function LeftSlot() {
  const cwd = useShell((s) => s.cwd)
  const busy = useShell((s) => s.busy())
  const threads = useShell((s) => s.threadList)
  const archived = useShell((s) => s.archivedList)
  const activeThreadId = useShell((s) => s.activeThreadId)
  const actions = useShell(threadActions, shallow)
  const workspaces = useWorkspaces()
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed)
  const expand = useLayoutStore((s) => s.setSidebarCollapsed)

  const pickWorkspace = () => void workspaces.pick()
  const newThread = () => void actions.newThread()

  if (sidebarCollapsed) {
    return (
      <SidebarRail
        hasCwd={Boolean(cwd)}
        busy={busy}
        threadCount={threads.length}
        onNew={cwd ? newThread : pickWorkspace}
        onExpand={() => expand(false)}
        onOpenSettings={() => openDialog('settings')}
        onOpenResources={() => toggleDockTab('skills')}
      />
    )
  }

  return (
    <LeftColumn
      threads={threads}
      archived={archived}
      activeThreadId={activeThreadId}
      cwd={cwd}
      busy={busy}
      onOpenWorkspace={pickWorkspace}
      onNew={newThread}
      onBatchDelete={(ids) => void actions.deleteThreads(ids)}
      onResume={(id) => void actions.resumeThread(id)}
      onArchive={(id) => void actions.archiveThread(id)}
      onUnarchive={(id) => void actions.unarchiveThread(id)}
      onDelete={(id) => void actions.deleteThread(id)}
      onRename={(id, name) => void actions.renameThread(id, name)}
      onCompact={(id) => void actions.compactThread(id)}
      onFork={(id) => void actions.fork(id)}
      onPin={actions.togglePin}
    />
  )
}

/**
 * 会话动作集合。抽成常量选择器：引用稳定，配 `shallow` 后不会因为
 * store 里别的字段变化而让左栏重渲染。
 */
const threadActions = (s: import('../../store/shell').ShellState) => ({
  newThread: s.newThread,
  resumeThread: s.resumeThread,
  archiveThread: s.archiveThread,
  unarchiveThread: s.unarchiveThread,
  deleteThread: s.deleteThread,
  deleteThreads: s.deleteThreads,
  renameThread: s.renameThread,
  compactThread: s.compactThread,
  fork: s.fork,
  togglePin: s.togglePin,
})
