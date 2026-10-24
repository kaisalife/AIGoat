import clsx from 'clsx'
import { StateDot, type StateDotTone } from '../primitives'
import { SOURCE_LABEL, type LedgerRow } from '../../store/ledger/row'
import { formatClock, formatDuration } from './useTimeWindow'
import s from './TrajectoryRow.module.css'

export interface TrajectoryRowProps {
  row: LedgerRow
  /** 上一行（算时长的基准）。没有上一行时为 null。 */
  prev: LedgerRow | null
  expanded: boolean
  onToggle: () => void
}

/**
 * 账本表格的一行。
 *
 * 六列都是固定的：时刻 / 来源徽章 / 种类 / 摘要 / 时长 / 轮次。
 * 刻意**不**做成可排序的宽表——账本是"按时间倒着查"的东西，
 * 按列排序会把时间顺序打散，而那正是它唯一的自然序。
 */
export function TrajectoryRow(props: TrajectoryRowProps) {
  const { row, prev, expanded, onToggle } = props
  // 时长 = 与上一行的到达时间差。只有 live 行可信（历史行的时刻是拉取时刻）。
  const gap = prev && prev.origin === 'live' && row.origin === 'live' ? row.at - prev.at : null

  return (
    <div
      className={clsx(s.row, expanded && s.expanded)}
      data-entry-id={row.id}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      <span className={s.clock}>{formatClock(row.at)}</span>

      <span className={s.source} title={`来源：${SOURCE_LABEL[row.source]}`}>
        <StateDot tone={toneOf(row.source)} size={6} />
        <span className={s.sourceText}>{SOURCE_LABEL[row.source]}</span>
      </span>

      <span className={s.kind}>{row.kind}</span>

      <span className={s.summary} title={row.summary}>
        {row.summary || '—'}
      </span>

      <span className={s.gap}>
        {gap !== null && gap >= 1 ? `+${formatDuration(gap)}` : ''}
      </span>

      <span className={s.turn} title={row.turnId ?? '不属于任何回合'}>
        {shortTurn(row.turnId)}
      </span>

      {row.origin === 'history' && (
        <span className={s.origin} title="从 thread/items/list 回补的行，时刻不可信">
          补
        </span>
      )}
    </div>
  )
}

function toneOf(source: LedgerRow['source']): StateDotTone {
  switch (source) {
    case 'model':
      return 'accent'
    case 'tool':
      return 'info'
    case 'host':
      return 'success'
    case 'unhandled':
      return 'warning'
  }
}

/** 轮次 id 通常是一串 uuid；只显示头 6 位，够认出来又不撑破列宽。 */
function shortTurn(turnId: string | null): string {
  if (!turnId) return '—'
  return turnId.slice(0, 6)
}