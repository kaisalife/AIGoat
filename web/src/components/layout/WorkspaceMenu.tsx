/**
 * 顶栏的工作区选择器。
 *
 * 单独成文件而不是塞进 TopBar：它有自己的浮层状态（开/关、点外面关闭），
 * 混进 TopBar 会让那堆 props 更难读。
 */

import { useEffect, useRef, useState } from 'react'
import type { WorkspaceSummary } from '../../bridge/client'

export interface WorkspaceMenuProps {
  workspaces: WorkspaceSummary[]
  active: string | null
  loading: boolean
  onPick: () => void
  onActivate: (path: string) => void
  onManage: () => void
}

export function WorkspaceMenu(props: WorkspaceMenuProps) {
  const { workspaces, active, loading, onPick, onActivate, onManage } = props
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const current = workspaces.find((w) => w.path === active)

  return (
    <div className="wsmenu" ref={wrap}>
      <button
        className={'wsmenu__button' + (current ? '' : ' is-empty')}
        onClick={() => setOpen(!open)}
        disabled={loading}
        aria-haspopup="menu"
        aria-expanded={open}
        title={current ? current.path : '还没有打开工作区'}
      >
        <span className="wsmenu__label">工作区</span>
        <span className="wsmenu__name truncate">
          {current ? current.name : loading ? '读取中…' : '未打开'}
        </span>
        <span className="wsmenu__caret">▾</span>
      </button>

      {open && (
        <div className="menu menu--dropdown" role="menu">
          {workspaces.length === 0 ? (
            <p className="wsmenu__empty">还没有工作区，下面挑一个文件夹开始。</p>
          ) : (
            workspaces.map((w) => (
              <button
                key={w.path}
                role="menuitemradio"
                aria-checked={w.path === active}
                className={'wsmenu__item' + (w.path === active ? ' is-active' : '')}
                title={w.path}
                onClick={() => {
                  setOpen(false)
                  onActivate(w.path)
                }}
              >
                <span className="wsmenu__tick">{w.path === active ? '✓' : ''}</span>
                <span className="truncate">{w.name}</span>
              </button>
            ))
          )}

          <div className="wsmenu__sep" />

          <button
            role="menuitem"
            className="menu__item"
            onClick={() => {
              setOpen(false)
              onPick()
            }}
          >
            打开其它文件夹…
          </button>
          <button
            role="menuitem"
            className="menu__item"
            disabled={workspaces.length === 0}
            onClick={() => {
              setOpen(false)
              onManage()
            }}
          >
            管理工作区…
          </button>
        </div>
      )}
    </div>
  )
}
