import { useMemo } from 'react'
import { Pill, Tooltip } from '../primitives'
import { useGuardRows } from '../../store/ledger'
import { useShell } from '../../store/shell'

export interface ReroutedBadgeProps {
  /** 改派只对"这一轮"有意义；换会话后不该继续挂着上一轮的徽标。 */
  turnId?: string | null
}

/**
 * 「模型被改派」徽标（14 号文件 §3.3）。
 *
 * # 为什么这条值得单独做
 *
 * `model/rerouted` 是 GuardEvent 组里对**自定义 provider 用户**最有价值的一条：
 * 用户在设置里精心配了模型 A，上游故障时 codex 悄悄改用模型 B 完成这一轮。
 * 不显示的话，用户会拿 B 的输出质量去评价 A 的配置——而 A 其实没问题。
 *
 * # 数据从账本取，不再另开订阅
 *
 * `guardEvent` 在 C 期已经映射、并且已经进了事件账本（06）。这里直接查账本，
 * 而不是再 `client.subscribe` 一次：一条事件两个消费者会让「是谁改的状态」
 * 变得难追，而账本本来就是"发生过什么"的忠实记录。
 *
 * 只看**本回合**：改派是逐回合的行为，把上一轮的改派一直挂着会让人以为
 * 当前还在用被换掉的模型。
 */
export function ReroutedBadge({ turnId }: ReroutedBadgeProps) {
  const threadId = useShell((s) => s.activeThreadId)
  // 只订阅 guard 事件子索引，而不是全量账本行：徽标挂在**每个**回合头上，
  // 订阅全量会让每条流式 delta 都让所有徽标重扫一遍账本（O(回合数 × 行数)）。
  const rows = useGuardRows(threadId)

  const rerouted = useMemo(() => findLastReroute(rows, turnId), [rows, turnId])
  if (!rerouted) return null

  return (
    <Tooltip
      placement="bottom"
      delay={150}
      content={`上游把这一轮改派到了 ${rerouted.to}（原本 ${rerouted.from}）。你设置的模型仍然保留，下一轮会再用它。`}
    >
      <span>
        <Pill tone="warning">已改派</Pill>
      </span>
    </Tooltip>
  )
}

interface Reroute {
  from: string
  to: string
}

/**
 * 找出最近一次改派。
 *
 * 限定 `turnId` 是因为改派逐回合发生；不传时取整个会话的最后一次
 * （用于"这个会话到底被改派过没有"这种整体判断）。
 */
export function findLastReroute(
  rows: { kind: string; turnId: string | null; payload: unknown }[],
  turnId?: string | null,
): Reroute | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row?.kind !== 'guardEvent') continue
    if (turnId && row.turnId !== turnId) continue
    const parsed = parseReroute(row.payload)
    if (parsed) return parsed
  }
  return null
}

/** 账本行里存的是原始事件：`{ type:'guardEvent', event:{ kind, fromModel, toModel } }`。 */
function parseReroute(payload: unknown): Reroute | null {
  if (!payload || typeof payload !== 'object') return null
  const event = (payload as Record<string, unknown>)['event']
  if (!event || typeof event !== 'object') return null
  const e = event as Record<string, unknown>
  if (e['kind'] !== 'modelRerouted') return null
  const to = e['toModel']
  return typeof to === 'string' && to ? { from: str(e['fromModel']), to } : null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '（未知）'
}