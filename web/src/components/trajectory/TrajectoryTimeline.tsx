import { useCallback, useRef } from 'react'
import { formatClock, formatDuration, ratioOf, useView, type View } from './useTimeWindow'
import type { LedgerRow } from '../../store/ledger/row'
import s from './TrajectoryTimeline.module.css'

export interface TrajectoryTimelineProps {
  rows: LedgerRow[]
  /** 数据的全量时间范围（视图的初始范围由它给出）。 */
  span: { from: number; to: number }
  /** 拖选的时间窗（二期把它与视口合并；一期并存）。 */
  window: { from: number; to: number } | null
  onSelect: (from: number, to: number) => void
  onClear: () => void
}

/**
 * 时序总览。
 *
 * # 二期补上的三件事（06 号板块 §3.2）
 *
 * - **滚轮缩放**：以光标位置为锚，所以放大时指针下的那一刻不动
 * - **右键拖拽平移**
 * - **跟随尾部**：实时事件进来时视口跟着走，但用户一拖就停
 *
 * # 拖选（窗口）与视口并存
 *
 * 一期只做了拖选，它管的是「表格里显示哪些行」；缩放平移管的是
 * 「时序图上看哪一段」。两者不是一回事，所以做成两层而不是互相覆盖——
 * 否则滚轮会把用户的筛选条件冲掉，那比没有缩放更糟。
 */
export function TrajectoryTimeline(props: TrajectoryTimelineProps) {
  const { rows, span, window, onSelect, onClear } = props
  const track = useRef<HTMLDivElement | null>(null)
  const view = useView({ span, tailMs: span.to })

  // 拖选用的锚点。与缩放/平移分开记：一次操作只属于其中一种。
  const anchor = useRef<number | null>(null)
  const panning = useRef<number | null>(null)

  const timeAt = useCallback((clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return view.view.from
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return view.view.from + ratio * view.view.span
  }, [view.view])

  const turns = groupByTurn(rows)

  return (
    <div className={s.timeline}>
      <div className={s.head}>
        <span className={s.title}>时序总览</span>
        <span className={s.span}>
          {formatClock(view.view.from)} → {formatClock(view.view.from + view.view.span)}
          <span className={s.zoomTag}>×{formatDuration(view.view.span)}</span>
        </span>
        <span className={s.spacer} />
        {!view.view.follow && (
          <button type="button" className={s.clear} onClick={view.toTail} title="回到最新">
            跟随尾部
          </button>
        )}
        {window && (
          <button type="button" className={s.clear} onClick={onClear}>
            清除筛选（{formatDuration(window.to - window.from)}）
          </button>
        )}
        <span className={s.hint}>滚轮缩放 · 右键拖拽平移 · 左键拖选筛选</span>
      </div>

      <div
        ref={track}
        className={s.track}
        role="slider"
        aria-label="时间视口"
        aria-valuemin={view.view.from}
        aria-valuemax={view.view.from + view.view.span}
        // 滚轮必须是非 passive 才能 preventDefault：浏览器默认会用滚轮
        // 滚动外层页面，那样缩放就变成了滚整个窗口。
        onWheel={(e) => {
          e.preventDefault()
          const rect = e.currentTarget.getBoundingClientRect()
          view.onWheel({ deltaY: e.deltaY, clientX: e.clientX, rect })
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          panning.current = e.clientX
        }}
        onMouseDown={(e) => {
          if (e.button === 2) return
          anchor.current = timeAt(e.clientX)
        }}
        onMouseMove={(e) => {
          if (panning.current !== null) {
            view.onDrag(e.clientX - panning.current)
            panning.current = e.clientX
            return
          }
          if (anchor.current !== null) onSelect(anchor.current, timeAt(e.clientX))
        }}
        onMouseUp={(e) => {
          // 左键：只在真的拖了一段距离之后才提交筛选。单击（不拖）不该
          // 产生一个 0ms 的时间窗——那会让表格突然只剩一行。
          if (anchor.current !== null && e.button !== 2) {
            const at = timeAt(e.clientX)
            if (Math.abs(at - anchor.current) > 1) onSelect(anchor.current, at)
          }
          anchor.current = null
          panning.current = null
        }}
        onMouseLeave={() => {
          anchor.current = null
          panning.current = null
        }}
      >
        <ViewWindow view={view.view} />
        <Ticks view={view.view} />

        {window && (
          <span
            className={s.selection}
            style={{
              left: `${ratioOf(window.from, viewportOf(view.view)) * 100}%`,
              width: `${(ratioOf(window.to, viewportOf(view.view)) - ratioOf(window.from, viewportOf(view.view))) * 100}%`,
            }}
          />
        )}

        <span className={s.turns}>
          {turns.map((turn) => {
            const box = viewportOf(view.view)
            const left = ratioOf(turn.start, box)
            const width = Math.max(0.6, ratioOf(turn.end, box) - left)
            return (
              <button
                key={turn.id}
                type="button"
                className={s.turn}
                style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
                title={`${turn.id} · ${turn.count} 条 · ${formatDuration(turn.end - turn.start)}`}
                onClick={() => view.focus(turn.start, turn.end)}
              />
            )
          })}
        </span>
      </div>
    </div>
  )
}

function viewportOf(view: View): { from: number; to: number } {
  return { from: view.from, to: view.from + view.span }
}

/** 视口之外压暗：一眼看得出"你正看着哪一段"。 */
function ViewWindow({ view }: { view: View }) {
  return (
    <>
      <span className={s.maskLeft} style={{ width: `${ratioOf(view.from, viewportOf(view)) * 100}%` }} />
      <span
        className={s.maskRight}
        style={{ width: `${(1 - ratioOf(view.from + view.span, viewportOf(view))) * 100}%` }}
      />
    </>
  )
}

/** 三条刻度。更多就成刻度尺了，反而读不出量级。 */
function Ticks({ view }: { view: View }) {
  return (
    <>
      {[0, 0.5, 1].map((ratio) => (
        <span key={ratio} className={s.tick} style={{ left: `${ratio * 100}%` }}>
          {formatClock(view.from + ratio * view.span)}
        </span>
      ))}
    </>
  )
}

interface TurnBlock {
  id: string
  start: number
  end: number
  count: number
}

/** 按回合分组。历史行的时刻不可信，所以跳过（否则甘特条会画出假的时间轴）。 */
function groupByTurn(rows: LedgerRow[]): TurnBlock[] {
  const map = new Map<string, TurnBlock>()
  for (const row of rows) {
    if (row.origin === 'history') continue
    const id = row.turnId ?? '__none__'
    const block = map.get(id)
    if (block) {
      block.start = Math.min(block.start, row.at)
      block.end = Math.max(block.end, row.at)
      block.count += 1
    } else {
      map.set(id, { id, start: row.at, end: row.at, count: 1 })
    }
  }
  return [...map.values()].sort((a, b) => a.start - b.start)
}
