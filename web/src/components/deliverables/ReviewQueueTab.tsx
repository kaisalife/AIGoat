import { useMemo, useState } from 'react'
import { Button, Pill, StateDot } from '../primitives'
import { getClient } from '../../bridge/session'
import { useLedgerRows } from '../../store/ledger'
import { useShell } from '../../store/shell'
import { useUi } from '../../store/ui'
import { safeJson } from '../../shared/safeJson'
import s from './ReviewQueue.module.css'

/**
 * 待复核队列（11 号板块 §3.2）。
 *
 * # 数据从账本来，而不是另开订阅
 *
 * `autoApprovalReview/strictReviewRequired` 在 C 期已映射成 `guardEvent`
 * 并进了事件账本（06）。这个 tab 只查账本——一条事件两个消费者会让
 * 「是谁改的状态」变得难追，而账本本来就是"发生过什么"的忠实记录。
 *
 * # 为什么按回合分组
 *
 * 一次复核通常对应上一回合的改动。堆成一列用户看不出"哪一轮要我批"，
 * 而这正是他需要判断的第一个问题。
 */
export function ReviewQueueTab() {
  const threadId = useShell((s) => s.activeThreadId)
  const rows = useLedgerRows(threadId)
  const detailLevel = useUi((s) => s.detailLevel)

  const groups = useMemo(() => groupByTurn(strictReviews(rows)), [rows])
  const [pending, setPending] = useState<{ assessment: unknown; title: string } | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (groups.length === 0) {
    return (
      <div className={s.pane}>
        <p className={s.empty}>
          没有待复核项。
          <br />
          需要严格复核时，codex 会在这里列出并说明理由。
        </p>
      </div>
    )
  }

  /**
   * 裁决：把当初那份评估事件**原样回灌**，另附批准/驳回 + 理由。
   *
   * 驳回**必须**填理由——它会被塞进回灌对象里成为这次裁决的正式记录。
   * 空理由的驳回等于没驳：下一个回合还会撞上同一个问题。
   */
  const verdict = async (approved: boolean) => {
    if (!pending || !threadId) return
    if (!approved && !reason.trim()) return
    setBusy(true)
    try {
      if (approved) {
        await getClient().reviewApprove(threadId, pending.assessment)
      } else {
        await getClient().reviewDeny(threadId, pending.assessment, reason.trim())
      }
      setPending(null)
      setReason('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.pane}>
      {groups.map((group) => (
        <section key={group.turnId} className={s.group}>
          <h3 className={s.head}>
            <StateDot tone="warning" size={6} />
            回合 {group.turnId ?? '—'}
            <span className={s.spacer} />
            <Pill tone="warning">{group.items.length} 项待复核</Pill>
          </h3>
          {group.items.map((item) => (
            <article key={item.key} className={s.item}>
              <header className={s.itemHead}>
                <span className={s.risk}>{item.riskLevel ?? '未知风险'}</span>
                <span className={s.spacer} />
                <Pill tone={item.authorized ? 'success' : 'warning'}>
                  {item.authorized ? '已授权' : '需人工确认'}
                </Pill>
              </header>
              {item.rationale && <p className={s.rationale}>{item.rationale}</p>}
              {detailLevel >= 2 && (
                <details className={s.detail}>
                  <summary>评估载荷</summary>
                  <pre className={s.payload}>{item.raw}</pre>
                </details>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  setPending({ assessment: item.assessment, title: item.key })
                }
              >
                裁决…
              </Button>
            </article>
          ))}
        </section>
      ))}

      {pending && (
        <div className={s.modal} role="dialog" aria-label="复核裁决">
          <h4 className={s.modalTitle}>裁决这次复核</h4>
          <p className={s.modalBody}>
            批准 = 允许它按自己的方案执行；驳回 = 让它换一个方案。
            <br />
            裁决会把当初那份评估记录原样回灌给 codex，**驳回理由是正式记录的一部分**。
          </p>
          <textarea
            className={s.reason}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="驳回时必填：为什么这个方案不行"
            aria-label="驳回理由"
          />
          <div className={s.modalActions}>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              取消
            </Button>
            <Button variant="danger" onClick={() => void verdict(false)} disabled={busy || !reason.trim()}>
              驳回
            </Button>
            <Button variant="primary" onClick={() => void verdict(true)} disabled={busy}>
              批准
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface StrictReview {
  key: string
  turnId: string | null
  riskLevel?: string
  rationale?: string
  authorized: boolean
  /** 原样回灌给 codex 的评估事件（docs/17 §5.7 的裁决出口）。 */
  assessment: unknown
  raw: string
}

/** 从账本里挑出 `strictReviewRequired`，并按回合归组。 */
function groupByTurn(items: StrictReview[]): { turnId: string | null; items: StrictReview[] }[] {
  const map = new Map<string, { turnId: string | null; items: StrictReview[] }>()
  for (const item of items) {
    const key = item.turnId ?? '__none__'
    const group = map.get(key)
    if (group) group.items.push(item)
    else map.set(key, { turnId: item.turnId, items: [item] })
  }
  return [...map.values()].sort((a, b) => (b.turnId ?? '').localeCompare(a.turnId ?? ''))
}

function strictReviews(
  rows: { kind: string; turnId: string | null; payload: unknown }[],
): StrictReview[] {
  const out: StrictReview[] = []
  for (const row of rows) {
    if (row.kind !== 'guardEvent') continue
    const event = payloadOf(row.payload)
    if (event['kind'] !== 'strictReviewRequired') continue
    out.push({
      key: String(event['reviewId'] ?? row.turnId ?? out.length),
      turnId: row.turnId,
      riskLevel: str(event['riskLevel']),
rationale: str(event['rationale']),
      authorized: event['userAuthorization'] === 'approved',
      // 裁决时要把这份评估**原样**回灌，所以整条 payload 都留着，
      // 不是只留解析出来的几个字段（docs/17 §5.7）。
      assessment: row.payload,
      raw: safeJson(row.payload),
    })
  }
  return out
}

function payloadOf(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {}
  const event = (payload as Record<string, unknown>)['event']
  return event && typeof event === 'object' ? (event as Record<string, unknown>) : {}
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}
