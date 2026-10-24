import clsx from 'clsx'
import { useState } from 'react'
import { getTab, allTabs, type DockTabId } from './tabRegistry'
import { useDockStore } from './useDockStore'
import type { DockLayout } from './types'
import { Button, Menu } from '../primitives'
import s from './DockTabs.module.css'

export interface DockTabsProps {
  layout: DockLayout
  threadId: string | null
}

/**
 * tab 条：标题、关闭、+ 菜单、可拖拽重排。
 *
 * 多实例的处理：一个 tab 在 `layout.open` 里出现几次就是几个实例，
 * 这里每个都画一个；关掉只关那一个。终端那种"tab 内再分实例"的做法
 * 在这里换成了"每个实例一个 tab"——少一层嵌套，切换也更直接。
 */
export function DockTabs({ layout, threadId }: DockTabsProps) {
  const openTab = useDockStore((s) => s.openTab)
  const closeTab = useDockStore((s) => s.closeTab)
  const selectTab = useDockStore((s) => s.selectTab)
  const moveTab = useDockStore((s) => s.moveTab)
  const commit = useDockStore((s) => s.commit)
  const [dragging, setDragging] = useState<number | null>(null)

  const onDrop = (to: number) => {
    if (dragging !== null && dragging !== to) moveTab(dragging, to, threadId)
    setDragging(null)
    commit()
  }

  return (
    <div className={s.bar} role="tablist" aria-label="右栏面板">
      <div className={s.tabs}>
        {layout.open.map((id, index) => (
          <Tab
            key={`${id}-${index}`}
            id={id}
            index={index}
            active={layout.active === id}
            dragging={dragging === index}
            onSelect={() => selectTab(id, threadId)}
            onClose={() => closeTab(id, threadId, index)}
            onDragStart={() => setDragging(index)}
            onDrop={() => onDrop(index)}
          />
        ))}
      </div>

      <Menu
        width={200}
        trigger={
          <button type="button" className={s.add} aria-label="打开面板" title="打开面板">
            +
          </button>
        }
        groups={[
          {
            label: '面板',
            items: allTabs().map((tab) => ({
              id: tab.id,
              label: tab.title,
              onSelect: () => openTab(tab.id, threadId),
            })),
          },
        ]}
      />
    </div>
  )
}

interface TabProps {
  id: DockTabId
  index: number
  active: boolean
  dragging: boolean
  onSelect: () => void
  onClose: () => void
  onDragStart: () => void
  onDrop: () => void
}

function Tab(props: TabProps) {
  const def = getTab(props.id)
  if (!def) return null
  const { glyph, title, badge: Badge } = def

  return (
    <div
      role="tab"
      aria-selected={props.active}
      draggable
      className={clsx(s.tab, props.active && s.active, props.dragging && s.dragging)}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        props.onDragStart()
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        props.onDrop()
      }}
      onDragEnd={() => props.onDrop()}
    >
      <button type="button" className={s.tabMain} onClick={props.onSelect} title={title}>
        <span className={s.glyph} aria-hidden="true">
          {glyph}
        </span>
        <span className={s.title}>{title}</span>
        {Badge ? <Badge /> : null}
      </button>
      {/* 关闭是独立按钮：点它不该同时触发 tab 切换 */}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        className={s.close}
        aria-label={`关闭 ${title}`}
        onClick={props.onClose}
      >
        ×
      </Button>
    </div>
  )
}