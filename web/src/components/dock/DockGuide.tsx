import { allTabs } from './tabRegistry'
import { useDockStore } from './useDockStore'
import { useShell } from '../../store/shell'
import { Button } from '../primitives'
import s from './DockGuide.module.css'

/**
 * 空态引导页（抄 dsh 的 guide）。
 *
 * 没有 tab 时显示，列出所有可打开的面板。刻意做成**可点的清单**而不是
 * 一句"右栏是空的"：右栏默认开着，占着屏幕却什么都不显示，用户会以为
 * 界面坏了。给一排能点的入口，他立刻就知道这里能干什么。
 */
export function DockGuide() {
  const threadId = useShell((s) => s.activeThreadId)
  const openTab = useDockStore((s) => s.openTab)
  const tabs = allTabs().filter((t) => t.source === 'builtin')

  return (
    <div className={s.guide}>
      <h2 className={s.title}>右栏</h2>
      <p className={s.sub}>打开一个面板：</p>
      <div className={s.list}>
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            variant="secondary"
            size="sm"
            className={s.item}
            onClick={() => openTab(tab.id, threadId)}
          >
            <span className={s.glyph} aria-hidden="true">
              {tab.glyph}
            </span>
            <span>{tab.title}</span>
          </Button>
        ))}
      </div>
      <p className={s.note}>
        每个会话各自记住打开的面板（存在安装目录的 ui-state.json 里）。
      </p>
    </div>
  )
}