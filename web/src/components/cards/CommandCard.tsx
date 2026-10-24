import { useMemo } from 'react'
import { CardShell, formatMs, toneOfStatus } from './CardShell'
import type { ToolEntry } from '../../store/entries'
import { primaryArg, statusLabel, toolSummary } from './summaries'
import { commandOutputView, omittedNote } from './commandOutput'
import { TerminalBlock } from '../primitives'
import { useSubAgentBadge } from '../subagent/useSubAgentBadge'

/**
 * `commandExecution`：命令行 + 退出码 + 耗时 + 流式输出。
 *
 * 输出走 TerminalBlock 而不是普通代码块：它是**会一直长**的东西，
 * 固定高度、贴底、不给"展开全部"——终端就是看最新输出的地方。
 *
 * # 长输出截断时中间要**说明**接上了
 *
 * 直接头尾拼在一起会让人以为那就是全部输出。所以中间插一行显式的
 * 「已省略 N 行」，并指向 Trajectory 账本（那里有全量）。截断与行数统计
 * 收在 `commandOutputView` 里：它只**数**行、不切分，避免流式下每条 delta
 * 都 `split('\n')` 出 O(n²) 的分配。
 */
export function CommandCard({ entry, defaultOpen }: { entry: ToolEntry; defaultOpen?: boolean }) {
  const running = entry.streaming
  const exit = entry.exitCode
  const duration = formatMs(entry.durationMs)

  return (
    <CardShell
      entryId={entry.id}
      summary={toolSummary(entry)}
      badge="命令"
      running={running}
      tone={toneOfStatus(entry.status)}
      defaultOpen={defaultOpen}
      meta={
        <>
          {exit !== null && exit !== undefined && (
            <span className={'card__exit' + (exit === 0 ? '' : ' card__exit--bad')}>exit {exit}</span>
          )}
          {duration && <span>{duration}</span>}
          <span className="card__status">{running ? '执行中' : statusLabel(entry.status)}</span>
        </>
      }
    >
      <CommandBody entry={entry} running={running} />
    </CardShell>
  )
}

function CommandBody({ entry, running }: { entry: ToolEntry; running: boolean }) {
  // 只在输出变化时重算；且 `commandOutputView` 未截断时原样返回，不切分。
  const view = useMemo(() => commandOutputView(entry.output), [entry.output])
  const input = primaryArg(entry.input)
  // 子代理徽标（09 号）：这条命令是派给某个已登记子代理跑的吗？
  const subAgent = useSubAgentBadge(input)

  return (
    <>
      {input && <pre className="card__input selectable">{input}</pre>}
      {subAgent && (
        <p className="subBadge" title={`已登记子代理：${subAgent.path}`}>
          派给子代理「{subAgent.name}」
          {subAgent.desc ? ` · ${subAgent.desc}` : ''}
        </p>
      )}
      {entry.error && <p className="card__error selectable">{entry.error}</p>}
      {view.empty ? (
        <p className="card__empty">{running ? '正在获取输出…' : '（无输出）'}</p>
      ) : (
        <TerminalBlock
          running={running}
          output={view.text}
          title={view.truncated ? omittedNote(view.total) : undefined}
        />
      )}
    </>
  )
}