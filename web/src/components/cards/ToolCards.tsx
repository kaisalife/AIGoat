import { useMemo } from 'react'
import { CardShell } from './CardShell'
import { DiffView } from './DiffView'
import type { FileEditEntry, ToolEntry } from '../../store/entries'
import { fileEditSummary, toolSummary, primaryArg, kindLabel } from './summaries'
import s from './ToolCards.module.css'

/**
 * `fileChange`：文件路径 + 行数统计 + diff。
 *
 * 摘要里带增删行数是刻意的——用户扫消息流时想知道的是"这一轮改了
 * 多少"，而不是"改了哪几个文件"；文件名在展开区才需要看清。
 */
export function FileChangeCard({
  entry,
  defaultOpen,
}: {
  entry: FileEditEntry
  defaultOpen?: boolean
}) {
  const running = entry.status === 'inProgress'
  const files = entry.changes.length

  return (
    <CardShell
      entryId={entry.id}
      summary={fileEditSummary(entry.changes)}
      badge="编辑"
      running={running}
      tone={running ? 'accent' : 'success'}
      defaultOpen={defaultOpen}
      meta={<span className="card__status">{running ? '写入中' : `${files} 个文件`}</span>}
    >
      <div className="card__stack">
        {entry.changes.map((change) => (
          <DiffView key={change.path} change={change} />
        ))}
      </div>
    </CardShell>
  )
}

/**
 * 通用工具卡的 JSON 正文。
 *
 * 参数与结果都按 JSON 缩进展示：结构化数据强行拍平成一行反而更难读，
 * 而「原样展示」是这类卡片唯一诚实的做法——我们不知道每个工具的
 * 参数长什么样。
 */
export function JsonBody({ input, output }: { input?: unknown; output?: unknown }) {
  // input 在流式期间不变，但卡片会随 output 增量重渲染——memo 掉它的序列化，
  // 别每条 delta 都把同一份入参 JSON.stringify 一遍。output 是字符串时
  // `pretty` 直接原样返回，也只有结构化输出才真的走 stringify。
  const inputText = useMemo(() => (input === undefined ? undefined : pretty(input)), [input])
  const outputText = useMemo(() => (output ? pretty(output) : undefined), [output])
  return (
    <div className="card__stack">
      {inputText !== undefined && <pre className="card__json selectable">{inputText}</pre>}
      {outputText !== undefined && <pre className="card__json selectable">{outputText}</pre>}
    </div>
  )
}

function pretty(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * MCP 工具卡的进度条（05 号板块 §3.2）。
 *
 * 只在**有进度文案且仍在跑**时显示：跑完之后进度条就是废话——用户要的是
 * 结果，不是"我刚才在干什么"。
 *
 * 高度压到 2px：它是"有动静"的信号，不是内容。做成正经的进度条会让人
 * 以为那是个可量化的百分比。
 */
export function McpToolCard({ entry, defaultOpen }: { entry: ToolEntry; defaultOpen: boolean }) {
  const running = entry.streaming
  return (
    <CardShell
      entryId={entry.id}
      summary={toolSummary(entry)}
      badge={kindLabel(entry.toolKind)}
      running={running}
      tone={running ? 'accent' : entry.status === 'failed' ? 'danger' : 'success'}
      defaultOpen={defaultOpen}
      meta={
        <>
          {/* 判定用 `status` 而不是 `error`——协议里 `status`
              （McpToolCallStatus）才是权威字段，`error` 只是失败时的结构化
              详情，可能为 null。

              之前这里按 `error` 判、而上面 tone 按 `status` 判，同一张卡片
              两套口径：一旦 codex 给出 status=failed 但没有结构化 error，
              卡片就是「红色 + 完成」，自相矛盾。 */}
          {!running && entry.status === 'failed' && (
            <span className="card__status card__status--bad">失败</span>
          )}
          {!running && entry.status !== 'failed' && <span className="card__status">完成</span>}
        </>
      }
    >
      {running && entry.progress && (
        <div className={s.progress} title={entry.progress}>
          <span className={s.progressText}>{lastLine(entry.progress)}</span>
          <span className={s.progressBar} aria-hidden="true" />
        </div>
      )}
      <JsonBody input={entry.input} output={entry.output || undefined} />
    </CardShell>
  )
}

/** 进度可能累积成多行，只显示最后一行——那是"现在在干什么"。 */
function lastLine(text: string): string {
  const lines = text.trim().split('\n')
  return lines[lines.length - 1] ?? ''
}

/**
 * `dynamicToolCall` / 未注册工具的兜底卡（05 §3.2）。
 *
 * 未知工具走这里，保证上游新增工具时 UI 不崩——这与事件层的
 * `unhandled` 透传是同一条哲学：宁可难看，不丢内容。
 */
export function DynamicToolCard({ entry, defaultOpen }: { entry: ToolEntry; defaultOpen?: boolean }) {
  const running = entry.streaming
  const arg = primaryArg(entry.input)
  return (
    <CardShell
      entryId={entry.id}
      summary={arg ? `${entry.name} ${arg}` : entry.name}
      badge={kindLabel(entry.toolKind)}
      running={running}
      tone={running ? 'accent' : entry.status === 'failed' ? 'danger' : 'neutral'}
      defaultOpen={defaultOpen}
    >
      <JsonBody input={entry.input} output={entry.output || undefined} />
    </CardShell>
  )
}