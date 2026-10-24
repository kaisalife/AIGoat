import clsx from 'clsx'
import type { DockPanelProps } from '../dock/types'
import type { TurnMeta } from '../../store/turnState'
import { useShell } from '../../store/shell'
import s from './PlanDocTab.module.css'

/**
 * 计划全文（右栏 tab，07 号文件 §2.2）。
 *
 * # 为什么是右栏而不是消息流里的一张卡
 *
 * 计划会**随回合推进不断更新**（`turn/plan/updated` 一次改好几步）。放在
 * 消息流里它会一直往下顶，用户正在读的那段被反复推走；放右栏它就地更新，
 * 中栏的滚动位置不受影响。
 *
 * 数据源是**当前回合的计划**（`shell.turn.plan`），而不是历史：历史计划在
 * 账本里，需要回看时切 Trajectory。
 */
export function PlanDocTab({ threadId }: DockPanelProps) {
  const plan = useShell((s) => s.turn.plan)
  const turnActive = useShell((s) => s.turn.turnActive)
  const turns = useShell((s) => s.turn.turns)

  // 最近一回合就是"当前这一轮"——turns 是新→旧排的。
  const activeTurn: TurnMeta | undefined = turns.at(-1)

// 空态判据必须把 `draft` 也算进去：计划正文取自协议的 `plan` item
  // （`{type, id, text}`，只有一段文本，没有 steps）。回放/重连后
  // `steps` 必然是空的，若按原判据 `steps.length === 0 && !explanation`
  // 就直接返回空态，把**已经存在的计划正文吞掉**。
  if (plan.steps.length === 0 && !plan.explanation && !plan.draft) {
    return (
      <div className={s.pane}>
        <p className={s.empty}>
          当前回合没有计划。
          <br />
          用 <code>/plan</code> 让模型先出计划再动手。
        </p>
      </div>
    )
  }

  return (
    <div className={s.pane}>
      <header className={s.head}>
        <span className={s.title}>计划</span>
        <span className="spacer" />
        {turnActive && <span className={s.live}>进行中</span>}
        {activeTurn && <span className={s.turn}>回合 {activeTurn.index + 1}</span>}
      </header>

      {plan.explanation && <p className={s.why}>{plan.explanation}</p>}
      {plan.draft && (
        <p
          className={s.draft}
          title={turnActive ? '正在增量写入的计划正文' : '上一轮的计划正文'}
        >
          {plan.draft}
        </p>
      )}

      <ol className={s.steps}>
        {plan.steps.map((step) => (
          <li key={`${step.step}-${step.status}`} className={clsx(s.step, s[`s_${step.status}`])}>
            <span className={s.mark} aria-hidden="true">
              {step.status === 'completed' ? '✓' : step.status === 'inProgress' ? '◐' : '○'}
            </span>
            <div className={s.body}>
              <p className={s.text}>{step.step}</p>
            </div>
          </li>
        ))}
      </ol>

      {threadId === null && (
        <p className={s.hint}>没有会话上下文，这里显示的是最近一次计划。</p>
      )}
    </div>
  )
}
