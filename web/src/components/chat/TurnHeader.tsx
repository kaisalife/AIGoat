import clsx from 'clsx'
import { ReroutedBadge } from '../model/ReroutedBadge'
import { Pill, Spinner, StateDot, Tooltip, type PillTone, type StateDotTone } from '../primitives'
import { formatTokens } from './tokenFormat'
import type { TurnMeta } from '../../store/turnState'

export interface TurnHeaderProps {
  meta: TurnMeta
  open: boolean
  onToggle: () => void
  /** 运行中：不允许折叠，且显示转圈。 */
  locked?: boolean
  /** 回滚到这一轮之前（03 号文件）。 */
  onRevert?: (beforeTurnId: string) => void
}

/**
 * 回合头部（04 §3.1）。
 *
 * 折叠态这一行要能独立回答两个问题：**这轮聊的是什么**（用户首问的前
 * 60 字）和**这轮花了多少**（token）。答不上来用户就得逐个展开看。
 */
export function TurnHeader(props: TurnHeaderProps) {
  const { meta, open, onToggle, locked = false, onRevert } = props
  const running = meta.status === 'inProgress'
  const firstTurn = isFirstTurn(meta.index)

  return (
    <button
      type="button"
      className={clsx('turnhead', running && 'turnhead--running')}
      onClick={onToggle}
      aria-expanded={open}
      disabled={locked}
      title={locked ? '本回合进行中' : undefined}
    >
      <span className={clsx('turnhead__caret', open && 'is-open')} aria-hidden="true">
        ▸
      </span>

      {running ? <Spinner size={11} /> : <StateDot tone={toneOf(meta.status)} size={7} />}

<span className="turnhead__label truncate">{meta.preview || `回合 ${meta.index + 1}`}</span>

      <ReroutedBadge turnId={meta.turnId} />

      <span className="turnhead__spacer" />

      {!running && meta.usage && meta.usage.total > 0 && (
        <span className="turnhead__usage">{formatTokens(meta.usage.total)}</span>
      )}

      {/* 回滚的触发点在这里而不是会话行菜单：回滚要指定「哪一回之前」，
          而回合只在消息流里可见。放到行菜单里用户得先去 Trajectory
          记下回合 id 回来点菜单——那不是可用的交互。
          第一回合没有"之前"，清空有独立路径（删会话）。 */}
      {!running && meta.turnId && !firstTurn && onRevert && (
        <Tooltip content="把对话历史回滚到这一轮之前。本地文件改动不会回滚。" delay={200}>
          <span
            role="button"
            tabIndex={0}
            className="turnhead__revert"
            onClick={(e) => {
              // 整行是个 button，回滚按钮在它里面——必须阻止冒泡，
              // 否则点回滚会顺带把这一轮折叠掉。
              e.stopPropagation()
              onRevert(meta.turnId!)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onRevert(meta.turnId!)
              }
            }}
          >
            ↶ 回滚
          </span>
        </Tooltip>
      )}

      {!running && (
        <Pill tone={toneOfPill(meta.status)}>{statusText(meta.status)}</Pill>
      )}
    </button>
  )
}


/**
 * 第一回合不能回滚到"它之前"——那等于清空整个会话。
 * 清空有独立的路径（删会话），混进回滚会让误点变成不可逆的丢失。
 */
function isFirstTurn(index: number): boolean {
  return index === 0
}

function toneOf(status: TurnMeta['status']): StateDotTone {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'danger'
    case 'interrupted':
      return 'warning'
    case 'inProgress':
      return 'accent'
    default:
      return 'neutral'
  }
}

function toneOfPill(status: TurnMeta['status']): PillTone {
  return status === 'inProgress' ? 'accent' : toneOf(status)
}

function statusText(status: TurnMeta['status']): string {
  switch (status) {
    case 'completed':
      return '完成'
    case 'failed':
      return '失败'
    case 'interrupted':
      return '已中断'
    case 'inProgress':
      return '进行中'
    default:
      return '进行中'
  }
}
