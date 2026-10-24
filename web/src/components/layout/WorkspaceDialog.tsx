/**
 * 管理工作区：列出已登记的文件夹，可切换、可在资源管理器里打开、可删除。
 *
 * 「删除」只移出本应用的工作区列表，**不会删磁盘上的文件夹**；要不要连带
 * 删掉这个工作区的会话由用户在确认框里二选一。
 */

import { useEffect, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import type { WorkspaceSummary } from '../../bridge/client'

export interface WorkspaceDialogProps {
  open: boolean
  workspaces: WorkspaceSummary[]
  active: string | null
  busy: boolean
  pendingRemoval: WorkspaceSummary | null
  onPick: () => void
  onActivate: (path: string) => void
  onReveal: (path: string) => void
  onAskRemove: (ws: WorkspaceSummary) => void
  onCancelRemove: () => void
  onConfirmRemove: (deleteSessions: boolean) => void
  onClose: () => void
}

export function WorkspaceDialog(props: WorkspaceDialogProps) {
  const {
    open,
    workspaces,
    active,
    busy,
    pendingRemoval,
    onPick,
    onActivate,
    onReveal,
    onAskRemove,
    onCancelRemove,
    onConfirmRemove,
    onClose,
  } = props

  // 二选一的结果要在打开期间保持，所以放在本地；关掉时复位，
  // 否则下一次删工作区会默认勾上「同时删除全部会话」。
  const [alsoSessions, setAlsoSessions] = useState(false)
  useEffect(() => {
    if (!pendingRemoval) setAlsoSessions(false)
  }, [pendingRemoval])

  if (!open && !pendingRemoval) return null

  return (
    <>
      {open && (
        <div className="confirm" role="dialog" aria-modal="true" aria-label="管理工作区">
          <div className="confirm__panel confirm__panel--wide">
            <h2 className="confirm__title">管理工作区</h2>
            <div className="confirm__body">
              {workspaces.length === 0 ? (
                <p className="wsdialog__empty">
                  还没有工作区。点下面的按钮挑一个文件夹——会话会按文件夹分开，
                  切换工作区只看到那个目录里的会话。
                </p>
              ) : (
                <ul className="wslist">
                  {workspaces.map((w) => (
                    <li
                      key={w.path}
                      className={'wslist__item' + (w.path === active ? ' is-active' : '')}
                    >
                      <div className="wslist__main">
                        <span className="wslist__name">
                          {w.name}
                          {w.path === active && <span className="badge badge--ok">当前</span>}
                        </span>
                        <span className="wslist__path truncate" title={w.path}>
                          {w.path}
                        </span>
                      </div>
                      <div className="wslist__ops">
                        {w.path !== active && (
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => onActivate(w.path)}
                            disabled={busy}
                          >
                            设为当前
                          </button>
                        )}
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => onReveal(w.path)}
                          title="在资源管理器里打开"
                        >
                          打开位置
                        </button>
                        <button
                          className="btn btn--ghost btn--sm btn--danger"
                          onClick={() => onAskRemove(w)}
                          disabled={busy}
                        >
                          删除
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="confirm__actions">
              <button className="btn" onClick={onClose} disabled={busy}>
                关闭
              </button>
              <button className="btn btn--primary" onClick={onPick} disabled={busy}>
                打开其它文件夹…
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title={`移出工作区「${pendingRemoval.name}」`}
          danger
          stacked
          busy={busy}
          confirmLabel="仅移出"
          middle={
            <button
              className={'btn btn--danger' + (alsoSessions ? ' is-on' : '')}
              disabled={busy}
              onClick={() => setAlsoSessions(true)}
              title="把这个工作区的会话也从 codex 侧删掉"
            >
              同时删除全部会话
            </button>
          }
          onCancel={onCancelRemove}
          onConfirm={() => onConfirmRemove(alsoSessions)}
        >
          <p>
            这只会把文件夹从工作区列表里移出，磁盘上的文件不会动。
            {alsoSessions
              ? '该工作区的会话会一起从 codex 侧删除，无法恢复。'
              : '会话仍保留在 codex 里，重新加回这个文件夹就能看到。'}
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}
