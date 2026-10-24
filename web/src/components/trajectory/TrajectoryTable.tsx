import { useEffect, useRef, useState } from 'react'
import { TrajectoryRow } from './TrajectoryRow'
import type { LedgerRow } from '../../store/ledger/row'
import { safeJson } from '../../shared/safeJson'
import s from './TrajectoryTable.module.css'

/** 与 `TrajectoryRow.module.css` 的 `.row` 高度一致——虚拟滚动靠它推算可见范围。 */
const ROW_HEIGHT = 32

/** 上下各多渲染这么多行，滚动手感才不"发涩"（滚得快时空白来不及补）。 */
const OVERSCAN = 8

export interface TrajectoryTableProps {
  rows: LedgerRow[]
  /** 行 id → 展开的检查器。 */
  expanded: Set<number>
  onToggle: (id: number) => void
}

/**
 * 账本表格（虚拟行）。
 *
 * # 手写窗口化，不引虚拟列表库
 *
 * 与整个项目的零 UI 依赖策略一致（02 号文件）。而且这里的需求很窄：
 * **固定行高 + 只滚不改顺序**，手写二十行就够；通用虚拟列表反而会带来
 * 一堆用不上的配置项。
 *
 * # 怎么算可见范围
 *
 * `scrollTop / ROW_HEIGHT` 得到首个可见行的下标，再上下各留 OVERSCAN 行。
 * 行高恒定是这个算法成立的前提——所以摘要一律单行截断（见 Row 的 CSS）。
 */
export function TrajectoryTable({ rows, expanded, onToggle }: TrajectoryTableProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(600)
  const ref = useRef<HTMLDivElement | null>(null)

  // 量容器高度：窗口化的可见行数全靠它。之前只在 onScroll 里顺手更新，
  // 于是刚打开（还没滚）或改了窗口大小时，渲染窗口按初值 600 算——容器更高
  // 时底部会留白，更矮时多渲染一堆看不见的行。用 ResizeObserver 一次量准。
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setHeight(el.clientHeight)
    const observer = new ResizeObserver(() => setHeight(el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const visible = Math.ceil(height / ROW_HEIGHT)
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const last = Math.min(rows.length, first + visible + OVERSCAN * 2)
  const slice = rows.slice(first, last)

  return (
    <div className={s.table} ref={ref} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div className={s.head}>
        <span>时刻</span>
        <span>来源</span>
        <span>种类</span>
        <span>摘要</span>
        <span className={s.right}>时长</span>
        <span>轮次</span>
        <span />
      </div>

      {/* 占位块撑出总高度，滚动条长度才是对的 */}
      <div className={s.spacer} style={{ height: rows.length * ROW_HEIGHT }}>
        <div className={s.window} style={{ transform: `translateY(${first * ROW_HEIGHT}px)` }}>
          {slice.map((row, i) => (
            <div key={row.id}>
              <TrajectoryRow
                row={row}
                prev={rows[first + i - 1] ?? null}
                expanded={expanded.has(row.id)}
                onToggle={() => onToggle(row.id)}
              />
              {expanded.has(row.id) && (
                <div className={s.inspector}>
                  <TrajectoryInspectorLite payload={row.payload} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {rows.length === 0 && <p className={s.empty}>账本还是空的。发一条消息，这里就会记下模型看到的每一个事件。</p>}
    </div>
  )
}

/**
 * 行内展开的 payload 预览。
 *
 * 完整的检查器在 `TrajectoryInspector`（右侧常驻）；这里只给一个能扫一眼的
 * JSON 片段，够回答"这条到底带了什么"。
 */
function TrajectoryInspectorLite({ payload }: { payload: unknown }) {
  return <pre className={s.payload}>{safeJson(payload)}</pre>
}