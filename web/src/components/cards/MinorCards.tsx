import clsx from 'clsx'
import { CardShell } from './CardShell'
import { statusLabel, toolSummary, truncate } from './summaries'
import type { FunctionOutputEntry, SubAgentEntry, ToolEntry } from '../../store/entries'
import { Pill } from '../primitives'

/**
 * 其余四张卡：联网检索、子代理、宿主工具、函数回传。
 *
 * 它们和三大主卡的区别只在"没有输出可折叠"或"点标题要跳走"，
 * 所以共用 CardShell 而不是各自再写一遍壳。
 */

/** `webSearch`：查询词 + 结果数。检索类调用输出往往很长，默认不展开。 */
export function WebSearchCard({ entry }: { entry: ToolEntry }) {
  const query = truncate(entry.input && typeof entry.input === 'object' && 'query' in entry.input
    ? String((entry.input as { query: unknown }).query ?? '')
    : '', 60)
  return (
    <CardShell
      entryId={entry.id}
      summary={query || toolSummary(entry)}
      badge="联网"
      running={entry.streaming}
      tone={entry.streaming ? 'accent' : entry.status === 'failed' ? 'danger' : 'info'}
      defaultOpen={false}
    >
      <JsonBodyLite text={entry.output} />
    </CardShell>
  )
}

/** `collabAgentToolCall`：agent 名 + 任务摘要。与子代理联动见 09。 */
export function CollabAgentCard({ entry }: { entry: ToolEntry }) {
  return (
    <CardShell
      entryId={entry.id}
      summary={toolSummary(entry)}
      badge="子 Agent"
      running={entry.streaming}
      tone={entry.streaming ? 'accent' : 'info'}
    >
      <JsonBodyLite text={entry.output} />
    </CardShell>
  )
}

/**
 * `functionCallOutput`：函数回传。
 *
 * 它是结果不是调用，所以标题不带动词；默认折叠——多数时候用户关心的是
 * 调用本身，不是回传的 JSON。
 */
export function FunctionOutputCard({ entry }: { entry: FunctionOutputEntry }) {
  return (
    <CardShell entryId={entry.id} summary={entry.name} badge="回传" defaultOpen={false}>
      <JsonBodyLite text={entry.output} />
    </CardShell>
  )
}

/** 子代理活动徽章（`subAgentActivity`）。点击跳到它的线程。 */
export function SubAgentBadge({
  entry,
  onOpen,
}: {
  entry: SubAgentEntry
  onOpen?: (threadId: string) => void
}) {
  const label = activityLabel(entry.activity)
  return (
    <button
      className={clsx('subagent', 'subagent--pill')}
      onClick={() => onOpen?.(entry.agentThreadId)}
      disabled={!onOpen}
      title={`子 Agent ${entry.agentThreadId} · ${entry.agentPath}`}
    >
      <Pill tone={toneOfActivity(entry.activity)} dot={entry.activity === 'started'}>
        {label}
      </Pill>
      <code className="subagent__id truncate">{entry.agentThreadId}</code>
    </button>
  )
}

function JsonBodyLite({ text }: { text: string }) {
  if (!text.trim()) return <p className="card__empty">（无输出）</p>
  return <pre className="card__json selectable">{text}</pre>
}

function activityLabel(kind: string): string {
  switch (kind) {
    case 'started':
      return '子 Agent 启动'
    case 'interacted':
      return '子 Agent 交互'
    case 'interrupted':
      return '子 Agent 中断'
    case 'completed':
      return '子 Agent 完成'
    default:
      return '子 Agent'
  }
}

function toneOfActivity(kind: string): 'info' | 'success' | 'warning' | 'neutral' {
  switch (kind) {
    case 'completed':
      return 'success'
    case 'interrupted':
      return 'warning'
    case 'started':
      return 'info'
    default:
      return 'neutral'
  }
}

/** `sleep`：等待卡。倒计时只在运行中显示，结束后就只是一行说明。 */
export function SleepCard({ durationMs, running }: { durationMs: number; running: boolean }) {
  return (
    <CardShell
      summary={`等待 ${Math.round(durationMs / 1000)}s`}
      badge="等待"
      running={running}
      tone="neutral"
      locked
    />
  )
}

/** `hookPrompt`：钩子请求确认。正文由 12 板块的审批卡接管。 */
export function HookPromptCard({ summary }: { summary: string }) {
  return (
    <CardShell summary={summary} badge="钩子" tone="warning" locked />
  )
}

export { statusLabel }