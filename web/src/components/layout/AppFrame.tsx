import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { computeColumns, RIGHTBAR_MIN, rightbarMax, SIDEBAR_MAX, SIDEBAR_MIN } from './columns'
import { DragHandle } from './DragHandle'
import { useLayoutStore } from './useLayoutStore'
import { WindowBar } from './WindowBar'
import s from './AppFrame.module.css'

export interface AppFrameProps {
  /** 顶栏（跨整宽）。 */
  topbar: ReactNode
  /** 左栏内容。会套上折叠 rail 的外壳。 */
  left: ReactNode
  /** rail 态下左栏顶部的图标按钮（新建、设置等）。 */
  leftRail?: ReactNode
  /** 中栏（会话视图 / 全局面板）。 */
  center: ReactNode
  /** 右栏 dock 面板。AppFrame 只提供 track，锚定由面板自己做。 */
  right?: ReactNode
  /** 底部状态条。 */
  statusbar: ReactNode
  /** 浮层：对话框、toast。 */
  overlay?: ReactNode
}

/**
 * 三栏骨架（抄 dsh `AppFrame.tsx` 的网格与拖拽）。
 *
 * 右栏是 **track 而非 box**：track 只负责占住宽度、把中栏挤开，
 * dock 面板自己 `position: absolute` 贴右缘。这样面板全屏或临时展开时
 * 不会反过来挤压消息流——占位与绘制分开，这是 track 语义的全部意义。
 *
 * 列宽只有一个求解入口（columns.ts），拖拽、窗口缩放、恢复旧布局都走它。
 */
export function AppFrame({
  topbar,
  left,
  leftRail,
  center,
  right,
  statusbar,
  overlay,
}: AppFrameProps) {
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed)
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth)
  const rightbarWidth = useLayoutStore((s) => s.rightbarWidth)
  const rightOpen = useLayoutStore((s) => s.rightOpen)
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth)
  const setRightbarWidth = useLayoutStore((s) => s.setRightbarWidth)
  const commit = useLayoutStore((s) => s.commit)
  const body = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  // 容器宽度而不是 window.innerWidth：窗口被拖出屏幕边缘时两者不等，
  // 用 window 会算出一截看不见的宽度。
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) =>
      setViewport(entry?.contentRect.width ?? window.innerWidth),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const collapsed = sidebarCollapsed
  const columns = computeColumns({
    viewport,
    sidebar: sidebarWidth,
    rightbar: rightbarWidth,
    sidebarCollapsed,
    rightOpen: rightOpen && right !== undefined,
  })

  const onLeftDelta = useCallback(
    (dx: number) => setSidebarWidth(sidebarWidth + dx),
    [sidebarWidth, setSidebarWidth],
  )
  const onRightDelta = useCallback(
    // 右栏把手在轨道左边：往右拖是变窄，所以取负
    (dx: number) => setRightbarWidth(rightbarWidth - dx),
    [rightbarWidth, setRightbarWidth],
  )

  return (
    <div className={s.frame} data-collapsed={collapsed || undefined}>
      {/* 自绘窗口条在最顶：decorations 关掉之后它就是标题栏 */}
      <WindowBar />
      {topbar}
      <div ref={body} className={s.body}>
        <aside className={clsx(s.left, collapsed && s.leftCollapsed)} style={{ width: columns.left }}>
          {collapsed ? leftRail : left}
        </aside>
        {!collapsed && (
          <DragHandle
            side="left"
            label="调整左栏宽度"
            value={columns.left}
            min={SIDEBAR_MIN}
            max={SIDEBAR_MAX}
            onDelta={onLeftDelta}
            onCommit={commit}
          />
        )}
        <main className={s.center} style={{ width: columns.center }}>
          {center}
        </main>
        {right !== undefined && columns.right > 0 && (
          <>
            <DragHandle
              side="right"
              label="调整右栏宽度"
              value={columns.right}
              min={RIGHTBAR_MIN}
              max={rightbarMax(viewport)}
              onDelta={onRightDelta}
              onCommit={commit}
            />
            <div className={s.rightTrack} style={{ width: columns.right }}>
              {right}
            </div>
          </>
        )}
      </div>
      {statusbar}
      {overlay}
    </div>
  )
}