import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { ThreadList } from './ThreadList'
import type { ThreadSummary } from '../../bridge/types'
import type { ThreadRowActions } from './ThreadRow'

export interface SidebarLeftProps extends ThreadRowActions {
  threads: ThreadSummary[]
  archived: ThreadSummary[]
  activeThreadId: string | null
  cwd: string
  busy: boolean
  /** 没有工作区时会引导用户去顶栏打开一个，而不是让"新建"变成死按钮。 */
  onOpenWorkspace: () => void
  onNew: () => void
  onBatchDelete: (ids: string[]) => void
}

/**
 * 左栏：会话列表的壳。
 *
 * 这里只管**多选态与删除确认**两件跨列表的事；分组、渲染、归档折叠
 * 都在 `ThreadList` 里。会话行本身（`ThreadRow`）是三者里唯一还碰
 * 业务语义的地方，所以壳不再往里加逻辑。
 */
export function SidebarLeft(props: SidebarLeftProps) {
  const {
    threads,
    archived,
    activeThreadId,
    cwd,
    busy,
    onOpenWorkspace,
    onNew,
    onBatchDelete,
    // onDelete 单独抽出来：行菜单的「删除」要先进确认框，不能直接调父组件
    // 传进来的那个。
    onDelete,
    ...rest
  } = props

  const [showArchived, setShowArchived] = useState(false)
  const [multi, setMulti] = useState(false)
  const [checked, setChecked] = useState<string[]>([])
  const [pendingDelete, setPendingDelete] = useState<ThreadSummary[] | null>(null)

  const exitMulti = () => {
    setMulti(false)
    setChecked([])
  }

  const toggleCheck = (id: string) => {
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // 删除永远先确认：会话删掉就没了，而且批量删除下手更快，误点代价更高。
  const askDelete = (ids: string[]) => {
    const targets = [...threads, ...archived].filter((t) => ids.includes(t.id))
    setPendingDelete(targets.length > 0 ? targets : null)
  }

  const confirmDelete = () => {
    const targets = pendingDelete ?? []
    setPendingDelete(null)
    const [single] = targets
    if (targets.length === 1 && single) onDelete(single.id)
    else onBatchDelete(targets.map((t) => t.id))
    exitMulti()
  }

  // 行菜单的「删除」要先弹确认，所以在这里把 onDelete 换掉，
  // 其余回调原样透传。
  const rows: ThreadRowActions = { ...rest, onDelete: (id) => askDelete([id]) }
  const [target] = pendingDelete ?? []

  return (
    <nav className="sidebar sidebar--left" aria-label="会话与资源">
<ThreadList
        threads={threads}
        archived={archived}
        activeThreadId={activeThreadId}
        cwd={cwd}
        busy={busy}
        multi={multi}
        checked={checked}
        showArchived={showArchived}
        onToggleCheck={toggleCheck}
        onToggleArchived={() => setShowArchived(!showArchived)}
        onToggleMulti={() => (multi ? exitMulti() : setMulti(true))}
        onOpenWorkspace={onOpenWorkspace}
        onNew={onNew}
        {...rows}
      />

      {multi && (
        <div className="bulkbar">
          <span className="bulkbar__count">已选 {checked.length}</span>
          <span className="spacer" />
          <button
            className="btn btn--danger btn--sm"
            disabled={checked.length === 0}
            onClick={() => askDelete(checked)}
          >
            删除所选
          </button>
          <button className="btn btn--ghost btn--sm" onClick={exitMulti}>
            取消
          </button>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.length === 1 ? '删除会话' : `删除 ${pendingDelete.length} 个会话`}
          danger
          confirmLabel="删除"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        >
          <p>
            {target ? (
              <>确定删除「{target.preview || '（无标题）'}」？</>
            ) : (
              <>确定删除选中的 {pendingDelete.length} 个会话？</>
            )}{' '}
            删除后无法恢复。
          </p>
        </ConfirmDialog>
      )}
    </nav>
  )
}