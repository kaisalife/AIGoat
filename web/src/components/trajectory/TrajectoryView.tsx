import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { TrajectoryTable } from './TrajectoryTable'
import { TrajectoryTimeline } from './TrajectoryTimeline'
import { useTimeWindow } from './useTimeWindow'
import { Button, SegmentedControl, type SegmentedOption } from '../primitives'
import { SOURCE_LABEL, type LedgerRow, type LedgerSource } from '../../store/ledger/row'
import { useLedger, useLedgerRows } from '../../store/ledger'
import { getClient } from '../../bridge/session'
import { useShell } from '../../store/shell'
import { ViewSwitch } from '../chat/ViewSwitch'
import s from './TrajectoryView.module.css'

type SourceFilter = LedgerSource | 'all'

const SOURCE_OPTIONS: SegmentedOption<SourceFilter>[] = [
  { value: 'all', label: '全部' },
  { value: 'model', label: SOURCE_LABEL.model },
  { value: 'tool', label: SOURCE_LABEL.tool },
  { value: 'host', label: SOURCE_LABEL.host },
  { value: 'unhandled', label: SOURCE_LABEL.unhandled },
]

/**
 * Trajectory 视图（06 号板块）：事件账本 + 时序总览。
 *
 * 与 Chat 的关系是**同一条事件流的两个投影**，不是两种模式：账本直接吃
 * 原始事件，消息流吃 reducer 加工过的条目（06 §2 的核心决策）。所以切
 * 过去再切回来，两边各自的状态都还在。
 *
 * 切到某个线程时会尝试从 `thread/items/list` 回补历史——实时流只覆盖
 * "这个窗口开着的时候"，三天前的会话光靠实时流是空的。
 */
export function TrajectoryView() {
  const threadId = useShell((s) => s.activeThreadId)
  const all = useLedgerRows(threadId)
  const total = useLedger((s) => s.total)
  const [source, setSource] = useState<SourceFilter>('all')
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const timeWindow = useTimeWindow()
  const mounted = useRef(true)

  const backfill = useCallback(async (id: string) => {
    try {
      const { items } = await getClient().threadItems(id, { limit: 200 })
      if (mounted.current) {
        useLedger.getState().pushHistory(id, items)
      }
    } catch {
      // 拉不到就保持现状：账本少一段历史不影响它作为实时记录的价值。
    }
  }, [])

  // 换线程时清掉展开态：旧的行 id 在新账本里不存在，留着会点不动。
  useEffect(() => {
    setExpanded(new Set())
  }, [threadId])

  useEffect(() => {
    if (!threadId) return
    // mounted 必须在**每次** effect 运行时复位：只置 false 的话，第一次
    // 换线程之后它永远是 false，后面所有 backfill 的结果都被自己丢弃
    // （「回补历史」按钮也就成了无声的空操作）。
    mounted.current = true
    void backfill(threadId)
    return () => {
      mounted.current = false
    }
  }, [threadId, backfill])

  const rows = useMemo(
    () => (source === 'all' ? all : all.filter((row) => row.source === source)),
    [all, source],
  )
  const visible = useMemo(
    () => rows.filter((row) => timeWindow.includes(row.at)),
    [rows, timeWindow],
  )
  const span = useMemo(() => spanOf(visible.length > 0 ? visible : rows), [visible, rows])
  const counts = timeWindow.counts(rows)

  return (
    <section className={s.view}>
      <TrajectoryTimeline
        rows={rows}
        span={span}
        window={timeWindow.window}
        onSelect={timeWindow.select}
        onClear={timeWindow.clear}
      />

      <div className={s.bar}>
        {/* 视图环必须在两个投影里都能看到：切到事件回放后，唯一的切换器
            原本只在会话头部渲染，等于一条单行道——进来就回不去（而且
            mainView 会持久化，重启也停在回放里）。 */}
        <ViewSwitch />
        <SegmentedControl
          label="来源筛选"
          options={SOURCE_OPTIONS}
          value={source}
          onChange={setSource}
        />
        <span className={s.spacer} />
        <span className={s.count}>
          {counts.shown === counts.total
            ? `${counts.total} 条`
            : `${counts.shown} / ${counts.total} 条`}
          <span className={s.total}>（本次会话累计 {total} 条）</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!threadId}
          onClick={() => threadId && void backfill(threadId)}
          title="从 thread/items/list 拉取更早的记录补进账本"
        >
          回补历史
        </Button>
      </div>

      <TrajectoryTable
        rows={visible}
        expanded={expanded}
        onToggle={(id) =>
          setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }
      />
    </section>
  )
}

/** 时间轴范围。空账本给一个零宽的轴，甘特条会据此什么都不画。 */
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