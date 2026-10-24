/**
 * 事件账本面板（06 号板块）：时间窗总览 + 来源筛选 + 虚拟行表格。
 *
 * 单独成文件是因为它与消息流是**两个滚动容器**：消息流要贴底跟随，
 * 账本要自由翻查。硬塞进同一个容器，两者都别扭（见 `ConversationStream`）。
 */

import { useState } from 'react'
import { TrajectoryTable } from '../trajectory/TrajectoryTable'
import { TrajectoryTimeline } from '../trajectory/TrajectoryTimeline'
import { useTimeWindow } from '../trajectory/useTimeWindow'
import { Button, SegmentedControl, type SegmentedOption } from '../primitives'
import { SOURCE_LABEL, type LedgerRow, type LedgerSource } from '../../store/ledger/row'
import { useLedger, useLedgerRows } from '../../store/ledger'
import { getClient } from '../../bridge/session'
import s from './ConversationStream.module.css'

type SourceFilter = LedgerSource | 'all'

const SOURCE_OPTIONS: SegmentedOption<SourceFilter>[] = [
  { value: 'all', label: '全部' },
  { value: 'model', label: SOURCE_LABEL.model },
  { value: 'tool', label: SOURCE_LABEL.tool },
  { value: 'host', label: SOURCE_LABEL.host },
  { value: 'unhandled', label: SOURCE_LABEL.unhandled },
]

export function Ledger({
  threadId,
  /** 第 4 档下账本是消息流的一部分，视觉上更紧。 */
  inline = false,
}: {
  threadId: string | null
  inline?: boolean
}) {
  const [source, setSource] = useState<SourceFilter>('all')
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const rows = useLedgerRows(threadId)
  const total = useLedger((s) => s.total)
  const win = useTimeWindow()

  const filtered = source === 'all' ? rows : rows.filter((row) => row.source === source)
  const visible = filtered.filter((row) => win.includes(row.at))
  const counts = win.counts(filtered)
  const span = spanOf(visible.length > 0 ? visible : filtered)

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className={inline ? `${s.ledger} ${s.ledgerInline}` : s.ledger}>
      <TrajectoryTimeline
        rows={filtered}
        span={span}
        window={win.window}
        onSelect={win.select}
        onClear={win.clear}
      />
      <div className={s.ledgerBar}>
        <SegmentedControl
          label="来源筛选"
          options={SOURCE_OPTIONS}
          value={source}
          onChange={setSource}
        />
        <span className="spacer" />
        <span className={s.ledgerCount}>
          {counts.shown === counts.total ? `${counts.total} 条` : `${counts.shown} / ${counts.total} 条`}
          <span className={s.ledgerTotal}>（本次会话累计 {total} 条）</span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => void backfill(threadId)}>
          回补历史
        </Button>
      </div>
      <TrajectoryTable rows={visible} expanded={expanded} onToggle={toggle} />
    </div>
  )
}

/**
 * 回补历史：拉一页就停（不循环翻到底）。
 *
 * 用户点这个按钮通常是「刚才那轮我漏看了」，一口气拉几千条会把界面卡住。
 */
async function backfill(threadId: string | null): Promise<void> {
  if (!threadId) return
  try {
    const { items } = await getClient().threadItems(threadId, { limit: 200 })
    useLedger.getState().pushHistory(threadId, items)
  } catch {
    // 拉不到就保持现状：账本少一段历史不影响它作为实时记录的价值。
  }
}

/** 时间轴范围。空账本给一个零宽的轴，甘特条据此什么都不画。 */
function spanOf(rows: LedgerRow[]): { from: number; to: number } {
  if (rows.length === 0) {
    const now = Date.now()
    return { from: now, to: now }
  }
  let from = Number.POSITIVE_INFINITY
  let to = Number.NEGATIVE_INFINITY
  for (const row of rows) {
    if (row.at < from) from = row.at
    if (row.at > to) to = row.at
  }
  // 整个账本落在同一毫秒时给一个最小宽度，否则甘特条会除以零
  return to - from < 1 ? { from: from - 1, to: to + 1 } : { from, to }
}