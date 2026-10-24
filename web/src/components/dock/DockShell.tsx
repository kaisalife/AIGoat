import { Suspense, useEffect } from 'react'
import { DockTabs } from './DockTabs'
import { DockGuide } from './DockGuide'
import { getTab } from './tabRegistry'
import { bindCurrentThreadId, useDockLayout, useDockStore } from './useDockStore'
import { useShell } from '../../store/shell'
import s from './DockShell.module.css'

/**
 * 右栏 dock：tab 条 + 活动面板区。
 *
 * 替代 `SidebarRight` + `Panels`（两者已退役）。三条结构决定写在这里：
 *
 * 1. **面板 absolute 锚定右缘**（01 §2.2 的 track 语义）。dock 只占宽度，
 *    不参与中栏的排版计算——所以面板将来做全屏展开也不会反过来挤压消息流。
 * 2. **布局按会话存**。切会话恢复各自那一组 tab；没有记录就用默认那组。
 * 3. **全部 tab 关掉就显示 guide**，不是留一块空白——空白会让人以为右栏坏了。
 *
 * `panel` 上带 `key`：多实例 tab 从"关一个实例"变成"切到另一个实例"时，
 * React 必须重建面板，否则它的内部状态（旧预览文件、旧终端滚动位置）
 * 会留在已经关掉的那个实例上。
 */
export function DockShell() {
  const threadId = useShell((s) => s.activeThreadId)
  const layout = useDockLayout(threadId)
  const hydrate = useDockStore((s) => s.hydrate)
  const hydrated = useDockStore((s) => s.hydrated)

  // 首屏取一次 dock 布局（ui-state.json 的 dock 段）。
  useEffect(() => {
    if (!hydrated) void hydrate()
  }, [hydrated, hydrate])

  // 顶栏按钮与快捷键需要知道"当前是哪个会话"才能操作对应的 dock 布局，
  // 但它们不属于任何面板——所以在这里登记一次，别让 App 层层传回调。
  useEffect(() => bindCurrentThreadId(() => threadId), [threadId])

  const active = layout.active ? getTab(layout.active) : undefined
  const Panel = active?.render
  // 多实例 tab：活动项取 `open` 里的**最后**一个下标（与 closeTab 的约定一致）。
  const activeIndex = layout.active === null ? -1 : layout.open.lastIndexOf(layout.active)
  const key = activeIndex >= 0 ? `${layout.active}-${activeIndex}` : 'none'

  return (
    <div className={s.dock}>
      <DockTabs layout={layout} threadId={threadId} />
      <div className={s.body}>
        {!active || !Panel || !layout.active ? (
          <DockGuide />
        ) : (
          <div className={s.panel} key={key} data-tab={layout.active}>
            {/* 面板是懒加载的：首次打开某个 tab 时它的 chunk 还在路上，
                Suspense 兜住这段窗口，加载完自动替换。 */}
            <Suspense fallback={<div className={s.loading}>加载中…</div>}>
              <Panel tabId={layout.active} threadId={threadId} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  )
}