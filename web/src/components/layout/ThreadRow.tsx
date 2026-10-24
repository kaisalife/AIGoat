/**
 * 会话条目：状态点 + 标题行 + 操作菜单 + 就地重命名。
 *
 * 小组件（状态点 / 菜单项 / 时间戳）在 `ThreadRowBits.tsx`。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThreadSummary } from '../../bridge/types'
import { isBusy } from './threadGrouping'
import { MenuItem, StatusDot, statusTitle, stamp } from './ThreadRowBits'
import s from './ThreadRow.module.css'

export interface ThreadRowActions {
  /**
   * 打开会话（回放历史）。**单击即打开**——之前单击只切游标、不回放，
   * 于是中栏显示的是上一个会话的内容，而用户以为自己点开了这一条。
   * 重复点击由 `resumeThread` 的在途去重兜住。
   */
  onResume: (id: string) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
  onCompact: (id: string) => void
  /** fork 出新会话（03 号文件）。 */
  onFork: (id: string) => void
  /** 置顶 / 取消置顶（03 号文件）。 */
  onPin: (id: string) => void
}

export function ThreadRow(props: {
  thread: ThreadSummary
  active: boolean
  archived?: boolean
  /** 多选态：整行变成勾选，不再是"打开会话"。 */
  multi?: boolean
  checked?: boolean
  /** 拖拽手柄是否可用（搜索结果里禁用——见 ThreadRows.tsx 的说明）。 */
  draggable?: boolean
  onToggleCheck?: (id: string) => void
} & ThreadRowActions) {
  const { thread, active, archived, multi, checked, draggable = false } = props
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(thread.preview ?? '')
  const wrap = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Esc 取消后卸载输入框，某些情况下会派发 blur——用这个标记保证取消不会被
  // blur 的提交逻辑覆盖掉。
  const cancelRename = useRef(false)

  // 点外面关菜单。不用 blur：菜单在输入框里获得焦点时 blur 会立刻把它关掉。
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menu])

  // 打开后把焦点送进第一项。菜单是 role="menu"，键盘用户期望方向键在其中
  // 移动；不先聚焦的话焦点还停在 ⋯ 上，方向键什么也做不了。
  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [menu])

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenu(false)
    if (restoreFocus) moreRef.current?.focus()
  }, [])

  const onMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // 别让 Esc 冒泡到全局（它会去清别的状态）。
      e.stopPropagation()
      closeMenu(true)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    )
    if (items.length === 0) return
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    items[(at + step + items.length) % items.length]?.focus()
  }, [closeMenu])

  if (renaming) {
    const commit = () => {
      if (cancelRename.current) {
        cancelRename.current = false
        setRenaming(false)
        return
      }
      const name = draft.trim()
      if (name && name !== (thread.preview ?? '')) props.onRename(thread.id, name)
      setRenaming(false)
    }
    return (
      <div className="threadrename" ref={wrap}>
        {/* 必须包在 form 里：裸 input 上的 onSubmit 不会触发，回车/失焦都会
            把用户输入直接丢掉。form 让回车成为真正的提交。 */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            commit()
          }}
        >
          <input
            className="threadrename__input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                cancelRename.current = true
                setRenaming(false)
              }
            }}
          />
        </form>
      </div>
    )
  }

  const running = isBusy(thread)

  return (
    <div className="threadrow" ref={wrap}>
      {draggable && !multi && (
        <span className={s.grip} aria-hidden="true" title="拖拽排序">
          ⠿
        </span>
      )}

      <button
        className={
          'threaditem' +
          (active ? ' is-active' : '') +
          (archived ? ' is-archived' : '') +
          (multi && checked ? ' is-checked' : '') +
          (running ? ' is-running' : '')
        }
        onClick={() => (multi ? props.onToggleCheck?.(thread.id) : props.onResume(thread.id))}
        title={statusTitle(thread) ?? thread.preview ?? thread.id}
        role={multi ? 'checkbox' : undefined}
        aria-checked={multi ? Boolean(checked) : undefined}
      >
        {multi ? (
          <span className={'threadcheck' + (checked ? ' is-on' : '')} aria-hidden="true">
            {checked ? '✓' : ''}
          </span>
        ) : (
          <StatusDot status={thread.status} />
        )}
        <span className="threaditem__title truncate">{thread.preview || '（无标题）'}</span>
        <span className="threaditem__meta">
          {thread.model && <span className="threaditem__model truncate">{thread.model}</span>}
          {thread.updatedAt && <span className="threaditem__time">{stamp(thread.updatedAt)}</span>}
        </span>
      </button>

      {/* 多选态下菜单没有意义（要删就批量删），藏起来免得误触。 */}
      {!multi && (
        <button
          ref={moreRef}
          className={'threadrow__more' + (menu ? ' is-open' : '')}
          onClick={() => setMenu(!menu)}
          aria-label="会话操作"
          aria-haspopup="menu"
          aria-expanded={menu}
        >
          ⋯
        </button>
      )}

      {menu && (
        <div className="menu" role="menu" ref={menuRef} onKeyDown={onMenuKeyDown}>
          {archived ? (
            <MenuItem
              label="取消归档"
              onClick={() => {
                setMenu(false)
                props.onUnarchive(thread.id)
              }}
            />
          ) : (
            <>
              <MenuItem
                label="重命名"
                onClick={() => {
                  setMenu(false)
                  cancelRename.current = false
                  setDraft(thread.preview ?? '')
                  setRenaming(true)
                }}
              />
              <MenuItem
                label={thread.pinned ? '取消置顶' : '置顶'}
                onClick={() => {
                  setMenu(false)
                  props.onPin(thread.id)
                }}
              />
              <MenuItem
                label="fork 出新会话"
                title="复制当前历史成一个新会话（原会话不受影响）"
                onClick={() => {
                  setMenu(false)
                  props.onFork(thread.id)
                }}
              />
              <MenuItem
                label="压缩上下文"
                // 压缩会让更早的历史被摘要，所以提示里要说明后果
                title="更早的历史会被摘要，模型之后看不到其中的细节"
                onClick={() => {
                  setMenu(false)
                  props.onCompact(thread.id)
                }}
              />
              <MenuItem
                label="归档"
                onClick={() => {
                  setMenu(false)
                  props.onArchive(thread.id)
                }}
              />
            </>
          )}
          <MenuItem
            label="删除"
            danger
            onClick={() => {
              setMenu(false)
              props.onDelete(thread.id)
            }}
          />
        </div>
      )}
    </div>
  )
}