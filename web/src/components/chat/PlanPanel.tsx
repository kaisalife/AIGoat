import { useState } from 'react'
import type { PlanStep, PlanStepState } from '../../bridge/types'
import type { PlanState } from '../../store/turnState'

const STATE_GLYPH: Record<PlanStepState, string> = {
  pending: '○',
  inProgress: '◐',
  completed: '●',
  blocked: '⊘',
}

const STATE_LABEL: Record<PlanStepState, string> = {
  pending: '待办',
  inProgress: '进行中',
  completed: '完成',
  blocked: '受阻',
}

/** 步骤状态由服务端定义，这里做一次宽容映射：认不出来就当待办。 */
export function normalizeStepStatus(raw: string): PlanStepState {
  switch (raw.toLowerCase()) {
    case 'completed':
    case 'done':
      return 'completed'
    case 'inprogress':
    case 'in_progress':
    case 'running':
      return 'inProgress'
    case 'blocked':
    case 'failed':
    case 'error':
      return 'blocked'
    default:
      return 'pending'
  }
}

/**
 * 计划面板。
 *
 * 放在消息流之上而不是混进消息流：它是「本回合要做什么」的**当前状态**，
 * 不是历史记录。混进去会被滚动带走，也没法一眼看到全局。
 */
export function PlanPanel(props: { plan: PlanState }) {
  const { plan } = props
  const [open, setOpen] = useState(true)
  const steps = plan.steps
  if (steps.length === 0 && !plan.draft && !plan.explanation) return null

  const done = steps.filter((s) => normalizeStepStatus(s.status) === 'completed').length

  return (
    <section className={'plan' + (open ? ' is-open' : '')}>
      <button className="plan__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <svg className={'plan__caret' + (open ? ' is-open' : '')} viewBox="0 0 24 24" fill="none">
          <path
            d="M9 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="plan__title">计划</span>
        {steps.length > 0 && (
          <span className="plan__progress">
            <span className="plan__bar" aria-hidden="true">
              <span className="plan__fill" style={{ width: `${(done / steps.length) * 100}%` }} />
            </span>
            <span className="plan__count">
              {done}/{steps.length}
            </span>
          </span>
        )}
        <span className="spacer" />
        {plan.explanation && (
          <span className="plan__why truncate" title={plan.explanation}>
            {plan.explanation}
          </span>
        )}
      </button>

      {open && (
        <div className="plan__body">
          <ol className="plan__steps">
            {steps.map((step, i) => (
              <Step key={i} step={step} />
            ))}
          </ol>
          {/* item/plan/delta 的增量正文：还没并入 steps，先原样挂着。 */}
          {plan.draft && <p className="plan__draft selectable">{plan.draft}</p>}
        </div>
      )}
    </section>
  )
}

function Step(props: { step: PlanStep }) {
  const state = normalizeStepStatus(props.step.status)
  return (
    <li className={'plan__step plan__step--' + state}>
      <span className="plan__glyph" aria-hidden="true">
        {STATE_GLYPH[state]}
      </span>
      <span className="plan__step-text">{props.step.step}</span>
      <span className="plan__step-state">{STATE_LABEL[state]}</span>
    </li>
  )
}
