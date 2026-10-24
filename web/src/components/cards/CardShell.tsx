import clsx from 'clsx'
import type { ReactNode } from 'react'
import { DisclosureRow, Spinner, StateDot, type StateDotTone } from '../primitives'

export interface CardShellProps {
  /** 摘要标题（算好的字符串，见 summaries.ts）。 */
  summary: ReactNode
  /** 运行中：状态点换转圈，标题走流光。 */
  running?: boolean
  /** 终态配色。running 时忽略。 */
  tone?: StateDotTone
  /** 类别徽标（"命令"/"MCP"…）。 */
  badge?: ReactNode
  /** 右侧元信息：退出码、耗时、状态文字。 */
  meta?: ReactNode
  /** 展开正文。没给就不渲染折叠箭头。 */
  children?: ReactNode
  /** 折叠区受控（如详情档位决定）。不给则自管。 */
  defaultOpen?: boolean
  locked?: boolean
  /** 语义锚点，供滚动恢复用。 */
  entryId?: string
  className?: string
}

/**
 * 工具卡的统一壳（05 §3.2）。
 *
 * 每个 Card 只填两段：**摘要计算**与**展开正文**。状态点、折叠、
 * 耗时、退出码这些在壳里做一次，各卡就不会各写一遍，也就不会出现
 * 三张卡三种失败样式。
 *
 * 不用 DisclosureRow：那个的摘要区语义是"一行的文字"，而这里摘要
 * 是一整块可交互的内容（可能带按钮）。壳自己管折叠更清楚。
 */
export function CardShell(props: CardShellProps) {
  const {
    summary,
    running = false,
    tone = 'neutral',
    badge,
    meta,
    children,
    defaultOpen = false,
    locked = false,
    entryId,
    className,
  } = props

  return (
    <div className={className} data-entry-id={entryId}>
      <DisclosureRow
        summary={
          <span className={clsx('cardshell__summary', running && 'cardshell__summary--running')}>
            {badge ? <span className="cardshell__badge">{badge}</span> : null}
            <span className="cardshell__label">{summary}</span>
            {meta ? <span className="cardshell__meta">{meta}</span> : null}
          </span>
        }
        meta={
          running ? (
            <Spinner size={11} />
          ) : (
            <StateDot tone={tone} size={7} label={typeof summary === 'string' ? summary : undefined} />
          )
        }
        defaultOpen={defaultOpen}
        locked={locked}
      >
        {children}
      </DisclosureRow>
    </div>
  )
}

/** 毫秒 → 人读。短则整数毫秒，长则秒，再长则分。 */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`
}

/** 终态 → 状态点配色。失败与拒绝要能一眼分开。 */
export function toneOfStatus(status: string | undefined): StateDotTone {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'danger'
    case 'declined':
      return 'warning'
    case 'inProgress':
      return 'accent'
    default:
      return 'neutral'
  }
}