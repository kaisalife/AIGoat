import { clsx } from 'clsx'
import { memo, useState } from 'react'
import { MessageItem } from './MessageItem'
import { ProcessGroup } from './ProcessGroup'
import { TurnDeliverablesCard } from '../deliverables/TurnDeliverablesCard'
import { TurnHeader } from './TurnHeader'
import { TurnUsagePanel } from './TurnUsagePanel'
import type { ChatNode } from '../../store/grouping'
import type { Entry } from '../../store/entries'
import type { TurnMeta } from '../../store/turnState'
import { expandsProcess, type DetailLevel } from '../../store/ui'

export interface TurnBlockProps {
  meta: TurnMeta
  nodes: ChatNode[]
  detailLevel: DetailLevel
  onApprove: (requestId: unknown) => void
  onDecline: (requestId: unknown) => void
  onUserInput: (requestId: unknown, answers: Record<string, string>) => void
  onElicitation: (requestId: unknown, content: unknown) => void
  onOpenThread?: (threadId: string) => void
  /** 打开子 Agent 只读面板（09 号板块）。 */
  onSubAgent?: (threadId: string) => void
  /** 回滚到某一轮之前（03 号文件）。 */
  onRevert?: (beforeTurnId: string) => void
}

/**
 * 一个回合的容器（04 §3.1）。
 *
 * 回合之间默认折叠成一个只显示「问的是什么 + 花了多少 token」的行：
 * 长会话里用户关心的是最近几轮，历史回合主动收起来才读得完整个对话。
 * 运行中的回合始终展开——那正是用户在等的东西。
 */
export function TurnBlock(props: TurnBlockProps) {
  const { meta, nodes } = props
  const running = meta.status === 'inProgress'
  const [open, setOpen] = useState(running)

  // 运行中强制展开：用户点收起也没意义，下一条事件又会把它推回来。
  const expanded = running || open

  return (
    <section className={clsx('turn', running && 'turn--running')} data-turn={meta.index}>
      <TurnHeader
        meta={meta}
        open={expanded}
        onToggle={() => setOpen(!open)}
        locked={running}
        onRevert={props.onRevert}
      />
      {expanded && (
        <div className="turn__body">
          {nodes.map((node) => (
            <NodeView key={nodeKey(node)} {...props} node={node} />
          ))}
          {/* 交付物聚合卡只在**结束的**回合出现：跑到一半的改动清单会一直变，
              反而让人盯着它看而不是看进展。 */}
          {!running && <TurnDeliverablesCard entries={collectEntries(nodes)} />}
          <TurnUsagePanel usage={meta.usage} running={running} />
        </div>
      )}
    </section>
  )
}

interface NodeViewProps extends TurnBlockProps {
  node: ChatNode
}

function NodeView(props: NodeViewProps) {
  const { node, detailLevel } = props

  if (node.type === 'group') {
    return (
      <ProcessGroup
        summary={node.summary}
        running={node.running}
        defaultOpen={expandsProcess(detailLevel)}
      >
        {node.children.map((child) => (
          <NodeView key={nodeKey(child)} {...props} node={child} />
        ))}
      </ProcessGroup>
    )
  }

  return (
    <div style={node.depth > 0 ? { paddingLeft: `${node.depth * 16}px` } : undefined}>
      <MessageItem {...props} entry={node.entry} />
    </div>
  )
}

/** 把节点树拍回条目列表——交付物卡要的是条目，不是渲染节点。 */
function collectEntries(nodes: ChatNode[]): Entry[] {
  const out: Entry[] = []
  for (const node of nodes) {
    if (node.type === 'entry') out.push(node.entry)
    out.push(...collectEntries(node.children))
  }
  return out
}

function nodeKey(node: ChatNode): string {
  return node.type === 'group' ? node.id : node.entry.id
}

export default memo(TurnBlock)