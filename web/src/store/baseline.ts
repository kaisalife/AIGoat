/**
 * 断线重连的**基线替换**（16 号板块 §3「重连基线替换」）。
 *
 * # 为什么需要它
 *
 * 事件流是有漏的：重连期间发生的一切，前端**永远收不到**。不补基线的
 * 后果不是"少了几条日志"，而是账本与消息流都会**说谎**——它们呈现的是
 * 一段被截断的历史，而用户以为那就是全部。
 *
 * # 为什么要"替换"而不是"追加"
 *
 * `thread/items/list` 返回的是**服务端认定的完整历史**。只是往现有条目上
 * 追加的话，重连期间的条目会和基线里的重复（那些我们其实收到了，只是
 * 先到后到的顺序不同）。所以整段替换。
 *
 * # 幂等
 *
 * 替换是幂等的：同样的基线跑两次得到同样的结果。所以可以放心地反复调
 * （比如用户手动点「重新同步」）。
 *
 * item → 条目的映射在 `baselineMap.ts`（与 Rust 侧 `map/history.rs` 同套规则）。
 */

import { mapItem } from './baselineMap'
import type { Entry } from './entries'
import type { TurnMeta, TurnState } from './turnState'
import { emptyTurnState, previewOf } from './turnState'

/** `thread/items/list` 返回的一条（协议 `ThreadItemEntry`）。 */
export interface ItemEntry {
  turnId: string
  item: Record<string, unknown>
}

/**
 * 用服务端基线替换整个回合态。
 *
 * 入参是**倒序**（协议给的重连补历史方向就是倒着补的），这样能直接取到
 * "刚才那几轮"而不必等翻完整个历史。
 */
export function baselineFromItems(entries: ItemEntry[], activeTurn?: string | null): TurnState {
  const ordered = [...entries].reverse()
  const byTurn = new Map<string, Entry[]>()
  const order: string[] = []
  const turns: TurnMeta[] = []
  const turnIndexMap = new Map<string, number>()

  ordered.forEach((entry, i) => {
    const item = entry.item ?? {}
    const id = String(item['id'] ?? `base-${i}`)
    const turnId = entry.turnId || '__none__'
    const turnIndex = turnIndexMap.get(turnId)
    // 时间戳协议给的是秒；没有就用序号占位（排序只看相对）。
    const at = Number(item['timestamp'] ?? 0) * 1000 || i
    const mapped = mapItem(item, id, at, turnIndex === undefined ? turns.length : turnIndex)
    if (!mapped) return

    if (turnIndex === undefined) {
      turnIndexMap.set(turnId, order.length)
      byTurn.set(turnId, [])
      order.push(turnId)
      turns.push({
        index: turns.length,
        turnId: turnId === '__none__' ? null : turnId,
        startedAt: at,
        endedAt: null,
        // 基线没有状态：显示成"已完成"比"进行中"诚实——它确实不再跑了。
        status: 'completed',
        preview: '',
        usage: null,
      })
    }
    byTurn.get(turnId)!.push(mapped)
  })

  // 回合预览取该回合最后一条用户消息——与实时流里的口径一致。
  for (const meta of turns) {
    const list = byTurn.get(meta.turnId ?? '__none__') ?? []
    const lastUser = [...list].reverse().find((e) => e.kind === 'user')
    meta.preview = previewOf(lastUser?.kind === 'user' ? lastUser.text : '')
  }

  // 计划正文单独捞：协议的 `plan` item 是 `{type, id, text}`，只有一段文本
  // （见 ThreadItem），`mapItem` 按设计把它返回 null——计划走右栏的
  // PlanDocTab，不进消息流。
  //
  // 但那样 `turn.plan` 就永远是空的：它只由实时的 planUpdated/planDelta 填，
  // 于是**切换会话、重连、重同步基线之后计划面板一律空白**，而计划明明
  // 还在会话里。取**最后一个** plan item 的正文——计划是覆盖式的，后来的
  // 那份才是当前的。
  const lastPlan = lastPlanText(entries)

  const activeIndex = activeTurn ? turns.findIndex((t) => t.turnId === activeTurn) : -1
  return {
    ...emptyTurnState(),
    entries: order.flatMap((turnId) => byTurn.get(turnId) ?? []),
    turns,
    // 找得到 activeTurn → 游标落在它之后（下一个回合的序号）。
    // 找不到（回合已结束/不在本次分页里）→ **不能退回 0**：那会跟历史第 0 个
    // 回合撞号，随后的实时条目并进第一个历史块。退到历史总数。
    turn: activeIndex >= 0 ? activeIndex + 1 : turns.length,
    usage: { total: 0, input: 0, cached: 0, output: 0, reasoning: 0 },
    plan: lastPlan ? { ...emptyTurnState().plan, draft: lastPlan } : emptyTurnState().plan,
  }
}

/**
 * 最新一条 `plan` item 的正文。
 *
 * 入参 `entries` 是协议**倒序**（`sortDirection: "desc"`，新→旧）——
 * 本函数开头那句 `[...entries].reverse()` 就是为此存在的。所以最新那条在
 * **下标 0**，从前往后扫、返回第一个命中的。
 *
 * （别写成从后往前扫：我第一版那么写了，测试直接抓到取到的是最旧那份，
 * 于是面板上显示的是过期计划。）
 */
function lastPlanText(entries: ItemEntry[]): string {
  for (const entry of entries) {
    const item = entry?.item
    if (item?.['type'] === 'plan') {
      const text = item['text']
      if (typeof text === 'string' && text) return text
    }
  }
  return ''
}