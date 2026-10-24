/**
 * 时间窗状态（06 号板块 §3.2）。
 *
 * 一期只做**拖选过滤**与「全部」。滚轮缩放、右键平移、跟随尾部队列——
 * 三者都要在甘特条上处理指针语义，而一期先把"表格能按时间窗过滤"这条
 * 真正有用的能力落地（见 docs/06 §3.2「表格先行，甘特简化」）。
 *
 * 甘特条上的刻度是**真实时长投影**，不是行数：压缩过的那段时间在账本里
 * 只占几行，但甘特条上要留出对应的空档，否则"哪一轮慢"会被看错。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * 时间视口（06 号板块 §3.2 的二期：滚轮缩放 / 右键平移 / 跟随尾部）。
 *
 * # 视口 ≠ 时间窗
 *
 * - **视口**（`View`）：当前**看得见**的那段时轴，可以缩放平移
 * - **时间窗**（`TimeWindow`）：一个**筛选**区间，决定表格里显示哪些行
 *
 * 分成两个是因为它们的操作不同：视口跟滚轮走（高频、不改变数据），
 * 时间窗跟拖选走（低频、改变数据）。一期只做了后者——拖选够用了，
 * 缩放/平移在没有大量"停了很久的回合"时是找不到用处的。
 *
 * # 跟随尾部
 *
 * 实时事件进来时，若视口原本贴着尾部就跟着往前挪；用户一旦往回拖就
 * 停止跟随。不这样会出现"我在看历史，它自己跳走了"。
 */
export interface View {
  /** 视口左缘时间。 */
  from: number
  /** 视口宽度（毫秒）。 */
  span: number
  /** true = 贴着最新数据。 */
  follow: boolean
}

/** 缩放上下限：最窄 1 秒、最宽 100 天。再窄/再宽都没有可读内容。 */
export const MIN_SPAN = 1_000
export const MAX_SPAN = 100 * 24 * 60 * 60 * 1000

/** 每次滚轮缩放的比例。0.8 = 缩到 80%。 */
const ZOOM_STEP = 0.8

export interface UseViewOptions {
  /** 数据的时间范围（毫秒）。 */
  span: { from: number; to: number } | null
  /** 新事件到达时调，用于维持跟随。 */
  tailMs?: number
}

export interface ViewController {
  view: View
  /** 滚轮：以光标位置为锚缩放。 */
  onWheel: (e: { deltaY: number; clientX: number; rect: DOMRect }) => void
  /** 右键拖拽平移。传 `deltaX`（像素）。 */
  onDrag: (deltaX: number) => void
  /** 回到"贴尾部"。 */
  toTail: () => void
  /** 把某段时间居中显示（点甘特块时用）。 */
  focus: (from: number, to: number) => void
}

export function useView(options: UseViewOptions): ViewController {
  const { span, tailMs } = options
  const [view, setView] = useState<View>(() => ({
    from: span?.from ?? 0,
    span: Math.max(MIN_SPAN, (span?.to ?? MIN_SPAN) - (span?.from ?? 0)),
    follow: true,
  }))

  // 跟随尾部：新数据把右缘往前推。左缘不动——右推左缘会让整个图往右滑。
  useEffect(() => {
    if (!tailMs || !view.follow) return
    setView((v) => (v.follow ? { ...v, from: tailMs - v.span } : v))
  }, [tailMs, view.follow])

  const onWheel = useCallback<ViewController['onWheel']>(
    (e) => {
      const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
      setView((v) => {
        const nextSpan = clampSpan(v.span * factor)
        // 以光标位置为锚：光标下那一刻的时间在缩放前后保持不动。
        const ratio = (e.clientX - e.rect.left) / Math.max(1, e.rect.width)
        const anchor = v.from + ratio * v.span
        return { from: anchor - ratio * nextSpan, span: nextSpan, follow: false }
      })
    },
    [],
  )

  const onDrag = useCallback<ViewController['onDrag']>((deltaX) => {
    setView((v) => {
      const width = Math.max(1, window.innerWidth - 40)
      const shift = (deltaX / width) * v.span
      return { ...v, from: v.from + shift, follow: false }
    })
  }, [])

  const toTail = useCallback(() => {
    setView((v) => ({ ...v, follow: true, from: (tailMs ?? v.from + v.span) - v.span }))
  }, [tailMs])

  const focus = useCallback<ViewController['focus']>((from, to) => {
    setView({ from, span: clampSpan(Math.max(to - from, MIN_SPAN)), follow: false })
  }, [])

  return useMemo(() => ({ view, onWheel, onDrag, toTail, focus }), [view, onWheel, onDrag, toTail, focus])
}

function clampSpan(span: number): number {
  return Math.min(MAX_SPAN, Math.max(MIN_SPAN, span))
}

/** 时间窗。`null` 表示不限（看全量）。 */
export interface TimeWindow {
  from: number
  to: number
}

export interface UseTimeWindow {
  /** 当前时间窗；null = 全量。 */
  window: TimeWindow | null
  /** 在整条时间轴上拖选一个区间。 */
  select: (from: number, to: number) => void
  /** 取消筛选，回到全量。 */
  clear: () => void
  /** 判断一行是否落在窗内。 */
  includes: (at: number) => boolean
  /** 当前时间轴的范围（账本的最小/最大时间）。 */
  span: { from: number; to: number } | null
  /** 全量行数与窗内行数，给表格显示"显示 N / 共 M"。 */
  counts: (rows: readonly { at: number }[]) => { shown: number; total: number }
}

export function useTimeWindow(): UseTimeWindow {
  const [window, setWindow] = useState<TimeWindow | null>(null)

  const select = useCallback((from: number, to: number) => {
    // 拖反了也认：用户从右往左拖是常事，报错不如直接纠正。
    setWindow({ from: Math.min(from, to), to: Math.max(from, to) })
  }, [])

  const clear = useCallback(() => setWindow(null), [])

  const includes = useCallback(
    (at: number) => window === null || (at >= window.from && at <= window.to),
    [window],
  )

  const counts = useCallback(
    (rows: readonly { at: number }[]) => ({
      total: rows.length,
      shown: window === null ? rows.length : rows.filter((r) => includes(r.at)).length,
    }),
    [window, includes],
  )

  const span = useMemo(() => null, [])

  return { window, select, clear, includes, counts, span }
}

/**
 * 把时间轴映射到 0..1 的比例（甘特条画条形用）。
 *
 * 整个时间域落在同一毫秒内时（测试数据、极短会话）不能除以零——
 * 这时把整条轴当成起点，返回 0 让所有条形叠在最左边。
 */
export function ratioOf(at: number, span: { from: number; to: number }): number {
  const total = span.to - span.from
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, (at - span.from) / total))
}

/** 时刻 → `HH:MM:SS.mmm`。账本的时间精度到毫秒，再细就没法读了。 */
export function formatClock(at: number): string {
  const d = new Date(at)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/** 时长 → `1.2s` / `340ms` / `2m05s`。甘特条的 tooltip 用。 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`
}