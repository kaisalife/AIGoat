import clsx from 'clsx'
import { Tooltip } from '../primitives'
import s from './ContextMeter.module.css'

/**
 * 环形占用率的阈值。三档而非"满/不满"两档：
 * 70% 开始提醒、90% 需要处理，中间那段是最容易措手不及的（还能跑，
 * 但再来两轮就满了）。
 */
const WARN = 0.7
const DANGER = 0.9

export interface ContextMeterProps {
  used: number
  limit: number
  /** 点开 breakdown。省略时不渲染成按钮。 */
  onClick?: () => void
}

/**
 * 环形上下文占用（13 号板块）。
 *
 * SVG `stroke-dasharray` 实现：周长乘比例就是已用长度。不用 `<progress>`
 * ——它只能是一条直线，嵌不进 composer 的下缘。
 *
 * limit 为 0 表示模型目录里没填上下文窗口，此时**不画环**，只显示一个
 * 问号：画一个"100% 满"的环会让人以为窗口已经用尽。
 */
export function ContextMeter({ used, limit, onClick }: ContextMeterProps) {
  const known = limit > 0
  const ratio = known ? Math.min(1, used / limit) : 0
  const tone = !known ? 'unknown' : ratio >= DANGER ? 'danger' : ratio >= WARN ? 'warn' : 'ok'
  const percent = known ? `${Math.round(ratio * 100)}%` : '?'

  const body = (
    <div
      className={clsx(s.meter, s[tone], onClick && s.clickable)}
      role={onClick ? 'button' : 'img'}
      aria-label={`上下文已用 ${percent}`}
      onClick={onClick}
    >
      {known ? <Ring ratio={ratio} /> : <span className={s.question}>?</span>}
    </div>
  )

  return (
    <Tooltip
      placement="top"
      delay={200}
      content={
        known
          ? `上下文 ${used} / ${limit}（${percent}）`
          : '模型目录里没填上下文窗口，显示不出占用'
      }
    >
      {body}
    </Tooltip>
  )
}

/** 环：直径 28px、环宽 3px。起点在 12 点方向。 */
function Ring({ ratio }: { ratio: number }) {
  const r = 11
  const circumference = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 28 28" className={s.ring} aria-hidden="true">
      <circle cx="14" cy="14" r={r} className={s.track} />
      <circle
        cx="14"
        cy="14"
        r={r}
        className={s.fill}
        strokeDasharray={`${circumference * ratio} ${circumference}`}
        transform="rotate(-90 14 14)"
      />
    </svg>
  )
}