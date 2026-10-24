import { CardShell } from './CardShell'
import type { ToolCallEntry } from '../../store/entries'

/**
 * 客户端工具调用的卡片（`item/tool/call`）。
 *
 * 与其它工具卡的最大区别：**宿主正在替 codex 干活，而且必须回话**。
 * 所以这张卡的状态由执行器推进（store 的 ingest 分支），不靠事件收口——
 * 没有 codex 发来的"工具完成"通知，因为工具跑在宿主这边。
 *
 * 失败时必须显示原因：用户看到的是一个红点却没有下文，会以为是应用崩了。
 */
export function ClientToolCard({ entry }: { entry: ToolCallEntry }) {
  const running = entry.status === 'running'
  return (
    <CardShell
      entryId={entry.id}
      summary={`${entry.namespace ? `${entry.namespace}/` : ''}${entry.tool}`}
      badge="宿主工具"
      running={running}
      tone={running ? 'accent' : entry.status === 'failed' ? 'danger' : 'success'}
      // 运行时锁住：内容还在变，折叠会让人以为卡死
      locked={running}
      meta={
        !running && (
          <span className="card__status">
            {entry.status === 'failed' ? '失败' : '已完成'}
          </span>
        )
      }
    >
      <pre className="card__json selectable">{entry.output || (running ? '执行中…' : '（无输出）')}</pre>
    </CardShell>
  )
}