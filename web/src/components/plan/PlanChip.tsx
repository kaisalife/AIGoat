import clsx from 'clsx'
import { Button, Pill } from '../primitives'
import type { PlanState } from '../../store/turnState'
import s from './PlanChip.module.css'

/** 计划的三态（07 号文件 §3.1）。 */
export type PlanPhase = 'idle' | 'active' | 'done'

export interface PlanChipProps {
  plan: PlanState
  phase: PlanPhase
  /** 点它：active 态是打开右栏文档，done 态是展开摘要。 */
  onOpen: () => void
  onToggleSummary: () => void
  showSummary: boolean
}

/**
 * 计划胶囊（07 号文件 §2.1）。
 *
 * # 三态的视觉差异必须在"一眼可辨"的范围里
 *
 * - idle：没有计划 → 只有一个空的胶囊（或干脆不显示）
 * - active：计划在推进 → 强调色 + 进度条 + 「在跑」的呼吸点
 * - done：全部完成 → 成功色 + 折叠成一行 + 可展开摘要
 *
 * 计划状态是「这一轮 Agent 在干什么」最直接的答案，所以它比 turn rail
 * 更该常驻：rail 要用户主动去看，chip 就在输入框上方，扫一眼就知道。
 */
export function PlanChip(props: PlanChipProps) {
  const { plan, phase, onOpen, onToggleSummary, showSummary } = props
  if (phase === 'idle') return null

  const total = plan.steps.length
  const done = plan.steps.filter((s) => s.status === 'completed').length
  const ratio = total > 0 ? done / total : 0

  return (
    <div className={clsx(s.chip, s[phase])}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onOpen}
        title={phase === 'active' ? '在右栏打开计划全文' : '计划已完成'}
      >
        <span className={s.label}>计划</span>
        {phase === 'active' ? (
          <>
            <span className={s.progress} aria-hidden="true">
              <span className={s.progressFill} style={{ width: `${ratio * 100}%` }} />
            </span>
            <span className={s.count}>
              {done}/{total}
            </span>
          </>
        ) : (
          <Pill tone="success">完成 {total} 步</Pill>
        )}
      </Button>

      {phase === 'done' && total > 0 && (
        <>
          <button
            type="button"
            className={s.toggle}
            onClick={onToggleSummary}
            aria-expanded={showSummary}
          >
            {showSummary ? '收起' : '摘要'}
          </button>
          {showSummary && (
            <ol className={s.steps}>
              {plan.steps.map((step) => (
                <li key={`${step.step}-${step.status}`} className={clsx(s.step, s[`step_${step.status}`])}>
                  <span className={s.stepMark} aria-hidden="true">
                    {step.status === 'completed' ? '✓' : '•'}
                  </span>
                  <span className={s.stepText}>{step.step}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}

/** 从计划本体推三态。放在这里是为了让"状态怎么判"和"状态怎么显示"挨着。 */
export function planPhaseOf(plan: PlanState, turnActive: boolean): PlanPhase {
  if (plan.steps.length === 0) return 'idle'
  const allDone = plan.steps.every((s) => s.status === 'completed')
  if (allDone) return 'done'
  return turnActive || plan.draft ? 'active' : 'idle'
}