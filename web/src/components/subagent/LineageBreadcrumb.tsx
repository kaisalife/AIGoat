import { useState } from 'react'
import { countNodes, useSubAgentTree, type SubAgentNode } from '../../store/subagents'
import { useShell } from '../../store/shell'
import { toggleDockTab } from '../dock/useDockStore'
import { StateDot } from '../primitives'
import { DescendantTree } from './DescendantTree'
import s from './LineageBreadcrumb.module.css'

/**
 * 会话头部的血缘面包屑（09 号板块 §4.2，抄 dsh 的 lineage breadcrumb）。
 *
 * # 只在有子代理时出现
 *
 * 没有子代理的会话是最常见的情况，常驻一个"子代理：无"的面包屑纯属噪音。
 *
 * # hover 展开后代，不常驻
 *
 * 树可能有几十个节点（一个主 agent 派十个并行任务）。常驻展开会把会话头
 * 撑到两三行，把标题和右边的操作挤走；hover 展开是 dsh 的做法，也是
 * 「我只是想知道有几个」这个问题的最短路径。
 */
export function LineageBreadcrumb() {
  const threadId = useShell((s) => s.activeThreadId)
  const nodes = useSubAgentTree(threadId)
  const [hover, setHover] = useState(false)

  const total = countNodes(nodes)
  if (total === 0) return null

  return (
    <div
      className={s.wrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className={s.pill}
        onClick={() => toggleDockTab('subagent')}
        title="打开子代理面板"
      >
        <StateDot tone={running(nodes) ? 'accent' : 'neutral'} busy={running(nodes)} size={6} />
        <span>子代理 {total}</span>
      </button>

      {hover && nodes.length > 0 && (
        <div className={s.pop} role="tree" aria-label="子代理树">
          {nodes.map((node) => (
            <DescendantTree key={node.threadId} node={node} depth={0} />
          ))}
        </div>
      )}
    </div>
  )
}

function running(nodes: SubAgentNode[]): boolean {
  return nodes.some((n) => n.running || running(n.children))
}