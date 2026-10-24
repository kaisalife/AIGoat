import clsx from 'clsx'
import { Button, StateDot, type StateDotTone } from '../primitives'
import { getClient } from '../../bridge/session'
import { useShell } from '../../store/shell'
import { formatElapsed, goalText, hasGoal, type GoalStatus } from './goalTypes'
import s from './GoalStrip.module.css'

/** 状态 → 中文 + 配色。`complete` 不算"好"也不算"坏"，单独一档。 */
function toneOf(status: GoalStatus | null | undefined): StateDotTone {
  switch (status) {
    case 'active':
      return 'accent'
    case 'complete':
      return 'success'
    case 'paused':
      return 'neutral'
    case 'blocked':
    case 'usageLimited':
    case 'budgetLimited':
      return 'warning'
    default:
      return 'neutral'
  }
}

function statusText(status: GoalStatus | null | undefined): string {
  switch (status) {
    case 'active':
      return '进行中'
    case 'paused':
      return '已暂停'
    case 'complete':
      return '已完成'
    case 'blocked':
      return '受阻'
    case 'usageLimited':
      return '额度用尽'
    case 'budgetLimited':
      return '预算用尽'
    default:
      return ''
  }
}

export interface GoalStripProps {
  /** 打开目标气泡（编辑目标文本）。 */
  onEdit: () => void
}

/**
 * 目标条（07 号板块，抄 dsh 的 `ui-goal` GoalStrip）。
 *
 * 常驻在 composer 上方：目标的存在意义是"模型会持续朝它跑"，所以它必须
 * 一直可见——藏进某个面板等于没设。
 *
 * # 暂停按钮的取舍
 *
 * 07 号文件写的是"若无 paused 字段则只做清除+编辑"。核实结果是
 * `ThreadGoalStatus` 里 `paused` **是一个枚举值**（docs/17 §5.3），
 * 所以暂停/恢复照做——协议有就不该不做。
 *
 * 数据来自 `shell.goal`，由 `goalEvent` 驱动（06 号板块已接真源）；
 * 本组件不自己订阅事件流：那条流已经有一个消费者（ingest），
 * 再加一个会让"谁改的"变得难追。
 */
export function GoalStrip({ onEdit }: GoalStripProps) {
  const goal = useShell((s) => s.goal)
  const threadId = useShell((s) => s.activeThreadId)
  const loadGoal = useShell((s) => s.loadGoal)

  if (!threadId || !hasGoal(goal)) return null
  const paused = goal?.status === 'paused'

  const after = (promise: Promise<unknown>) =>
    void promise
      .then(() => loadGoal())
      .catch((err) => {
        console.error('[GoalStrip] 刷新失败:', err)
      })

  return (
    <div className={s.strip} data-paused={paused || undefined}>
      <StateDot tone={toneOf(goal?.status)} size={7} />
      <span className={s.label}>目标</span>
      <span className={clsx(s.text, paused && s.textPaused)} title={goal?.objective ?? undefined}>
        {goalText(goal!)}
      </span>

      <span className={s.status}>{statusText(goal?.status)}</span>
      {typeof goal?.elapsedMs === 'number' && (
        <span className={s.meta}>{formatElapsed(goal.elapsedMs)}</span>
      )}

      <span className="spacer" />

      <Button variant="ghost" size="sm" onClick={onEdit}>
        编辑
      </Button>
      <Button
        variant="ghost"
        size="sm"
        title={paused ? '恢复目标' : '暂停目标（模型不再朝它推进）'}
        onClick={() => after(getClient().goalSet(threadId, { status: paused ? 'active' : 'paused' }))}
      >
        {paused ? '恢复' : '暂停'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        title="清除目标"
        onClick={() => after(getClient().goalClear(threadId))}
      >
        清除
      </Button>
    </div>
  )
}