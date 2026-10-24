import { CardShell, formatMs, toneOfStatus } from './CardShell'
import { CommandCard } from './CommandCard'
import { DynamicToolCard, FileChangeCard, McpToolCard } from './ToolCards'
import { CollabAgentCard, FunctionOutputCard, WebSearchCard } from './MinorCards'
import { expandsToolBody, type DetailLevel } from '../../store/ui'
import type { Entry, ToolEntry } from '../../store/entries'

/**
 * 按 kind 分流的入口（05 §3.1）。
 *
 * 只有一个 switch，且**必须穷举**：新增条目种类时这里编译不过，
 * 逼着决定它长什么样。走不到的分支（未知 kind）落到通用卡而不是
 * 返回 null——丢内容比丑一点糟得多。
 *
 * 详情档位在这里生效：0/1 档工具卡只出摘要，2 档才展开正文。
 */
export function ToolCardRouter({
  entry,
  detailLevel,
}: {
  entry: Entry
  detailLevel: DetailLevel
}) {
  const open = expandsToolBody(detailLevel)

  switch (entry.kind) {
    case 'tool':
      return <ToolEntryCard entry={entry} open={open} />
    case 'fileEdit':
      return <FileChangeCard entry={entry} defaultOpen={open} />
    case 'functionOutput':
      return <FunctionOutputCard entry={entry} />
    default:
      return null
  }
}

/**
 * 工具调用按 `toolKind` 再分流。
 *
 * `other`（未注册工具）落到通用卡：上游随时可能新增工具名，
 * 这里不做穷举校验，只对已知的三类做特化。
 */
export function ToolEntryCard({ entry, open }: { entry: ToolEntry; open: boolean }) {
  switch (entry.toolKind) {
    case 'command':
      return <CommandCard entry={entry} defaultOpen={open} />
    case 'mcp':
      return <McpToolCard entry={entry} defaultOpen={open} />
    case 'webSearch':
      return <WebSearchCard entry={entry} />
    case 'collabAgent':
      return <CollabAgentCard entry={entry} />
    default:
      return <DynamicToolCard entry={entry} defaultOpen={open} />
  }
}

/**
 * 回合内 diff（`turn/diff/updated`）的独立卡。
 *
 * 不走 ToolShell：它没有工具名也没有退出码，硬套壳会显示一堆空元信息。
 */
export function TurnDiffCard({ diff, entryId }: { diff: string; entryId?: string }) {
  return (
    <CardShell entryId={entryId} summary="回合 diff" badge="diff" tone="info">
      <pre className="card__json selectable">{diff}</pre>
    </CardShell>
  )
}

/** 供 Trajectory 侧复用：状态点配色与耗时格式化。 */
export { formatMs, toneOfStatus }