import type { TokenUsage } from '../../store/turnState'
import { formatTokens } from './tokenFormat'

/**
 * 回合用量（04 §1）。
 *
 * `cached` 单列并标出来：它决定了下一轮的实际增量花费。
 * 只显示 total 的话，用户看到 12k 会以为每轮都要花 12k，
 * 而实际上大部分命中了缓存。
 *
 * 本地回显的回合没有用量（还没结算），所以只显示累计值、不画占比条。
 */
export function TurnUsagePanel({
  usage,
  running,
}: {
  usage: TokenUsage | null
  running: boolean
}) {
  if (!usage || usage.total === 0) return null

  const inputOwn = Math.max(0, usage.input - usage.cached)
  const share = (value: number) => (value / Math.max(1, usage.total)) * 100

  return (
    <footer className="usage" aria-label="本回合 token 用量">
      <div className="usage__bar" aria-hidden="true">
        <span className="usage__seg usage__seg--cached" style={{ width: `${share(usage.cached)}%` }} />
        <span className="usage__seg usage__seg--input" style={{ width: `${share(inputOwn)}%` }} />
        <span className="usage__seg usage__seg--output" style={{ width: `${share(usage.output)}%` }} />
      </div>
      <div className="usage__legend">
        <span className="usage__item">
          <i className="usage__dot usage__dot--cached" aria-hidden="true" />
          缓存 {formatTokens(usage.cached)}
        </span>
        <span className="usage__item">
          <i className="usage__dot usage__dot--input" aria-hidden="true" />
          输入 {formatTokens(inputOwn)}
        </span>
        <span className="usage__item">
          <i className="usage__dot usage__dot--output" aria-hidden="true" />
          输出 {formatTokens(usage.output)}
        </span>
        {usage.reasoning > 0 && <span className="usage__item usage__item--muted">推理 {formatTokens(usage.reasoning)}</span>}
        <span className="usage__spacer" />
        <span className="usage__total">
          {running ? '本轮累计' : '合计'} {formatTokens(usage.total)}
        </span>
      </div>
    </footer>
  )
}