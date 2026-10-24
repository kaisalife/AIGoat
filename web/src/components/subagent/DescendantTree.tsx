import { useState } from 'react'
import { toggleDockTab } from '../dock/useDockStore'
import { StateDot } from '../primitives'
import { setWatchedThread } from '../../store/subagents'
import type { SubAgentNode } from '../../store/subagents'
import s from './LineageBreadcrumb.module.css'

/**
 * 后代树的一层（09 号板块 §4.2）。
 *
 * **懒加载**：子节点只在展开时才渲染。树可能很宽（一个主 agent 派十个
 * 任务），全展开的话 hover 一下就弹出上百行——那不叫面包屑，叫弹窗。
 */
export function DescendantTree({
  node,
  depth,
}: {
  node: SubAgentNode
  depth: number
}) {
  const [open, setOpen] = useState(depth < 1)
  const hasChildren = node.children.length > 0
  const label = node.path.split('/').filter(Boolean).pop() ?? node.threadId

  return (
    <div className={s.node} data-depth={depth}>
      <div className={s.row} style={{ paddingLeft: depth * 12 }}>
        {hasChildren ? (
          <button
            type="button"
            className={s.caret}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? '收起' : '展开'}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className={s.caretSpacer} />
        )}

        {/* 点节点名 → 打开只读 tab，而不是切走当前会话。
            切走会打断正在跑的回合，而用户只是想"看一眼那边在干什么"。 */}
        <button type="button" className={s.name} onClick={() => openThread(node)}>
          <StateDot tone={node.running ? 'accent' : 'success'} busy={node.running} size={6} />
          <span className="truncate">{label}</span>
        </button>

        <span className={s.spacer} />
        <span className={s.activity}>{activityLabel(node.activity)}</span>
      </div>

      {open &&
        node.children.map((child) => (
          <DescendantTree key={child.threadId} node={child} depth={depth + 1} />
        ))}
    </div>
  )
}

/**
 * 打开只读 tab 并指向这个线程。
 *
 * `toggleDockTab` 只负责确保 tab 存在；线程 id 通过全局暂存传给面板——
 * tab 类型是单例（09 号文件 §4.2），没法用 prop 传参。
 */
function openThread(node: SubAgentNode): void {
  setWatchedThread(node.threadId)
  toggleDockTab('subagent')
}

function activityLabel(activity: string): string {
  switch (activity) {
    case 'started':
      return '启动'
    case 'interacted':
      return '交互中'
    case 'interrupted':
      return '已中断'
    case 'completed':
      return '完成'
    default:
      return activity
  }
}
