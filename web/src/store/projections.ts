/**
 * 三个投影（16 号板块 §1）。
 *
 * # 为什么要投影而不是各算各的
 *
 * 界面里反复要算「这几轮一共烧了多少」「这个会话在忙什么」「哪一轮最贵」，
 * 而它们**都是纯函数**。散开算的风险不是现在算错，而是同一口径被算两次
 * 之后慢慢分叉（比如状态栏算「本轮」而回合头算「累计」）。
 *
 * 所以口径只写一份，各消费方订阅。这里不缓存、不 memo——它只是把「同一口径」
 * 这件事从「靠人盯」变成「靠类型系统」。
 *
 * # 三个投影的来源不同，别混
 *
 * - `turnSummaries`：从 `turns` 数组算，纯展示
 * - `sessionStats`：跨回合累计（token / 时长 / 轮数）
 * - `budgetPressure`：13 号板块的上下文余量
 */

import { useMemo } from 'react'
import type { TokenUsage, TurnMeta } from './turnState'

/** 回合摘要：回合头与 turn rail 显示的形状。 */
export interface TurnSummary {
  index: number
  turnId: string | null
  preview: string
  status: TurnMeta['status']
  /** 本轮 token；未结束时是累计值。 */
  tokens: number
  /** 上一轮到这一轮的间隔（ms），null = 取不到。 */
  gapMs: number | null
}

export function turnSummaries(turns: TurnMeta[]): TurnSummary[] {
  return turns.map((meta, i) => ({
    index: meta.index,
    turnId: meta.turnId,
    preview: meta.preview,
    status: meta.status,
    tokens: meta.usage?.total ?? 0,
    gapMs: gapTo(turns, i),
  }))
}

/**
 * 与上一轮的间隔。
 *
 * 用 `startedAt` 差而不是"这一轮跑了多久"：用户关心的是"我隔多久才又发了一次"，
 * 那才是等待体感。��结束时间的有几轮算不出来，返回 null 而不是 0——
 * 0 会被画成"间隔 0ms"，比"不知道"更骗人。
 */
function gapTo(turns: TurnMeta[], index: number): number | null {
  const prev = turns[index - 1]
  const cur = turns[index]
  if (!prev || !cur) return null
  // 同样用 `!= null`：基线重建时 `startedAt` 可能是 0，真值判断会误判成"取不到"。
  if (prev.endedAt == null || cur.startedAt == null) return null
  return Math.max(0, cur.startedAt - prev.endedAt)
}

/** 跨回合累计。状态栏与设置中心的「会话数据」域用。 */
export interface SessionStats {
  turns: number
  completed: number
  failed: number
  running: boolean
  totalTokens: number
  totalElapsedMs: number
  avgTurnMs: number | null
}

export function sessionStats(turns: TurnMeta[]): SessionStats {
  let totalTokens = 0
  let totalElapsedMs = 0
  let elapsedTurns = 0
  let completed = 0
  let failed = 0
  let running = false

  for (const meta of turns) {
    totalTokens += meta.usage?.total ?? 0
    // 用 `!= null` 而不是真值判断：`startedAt === 0` 是合法的
    //（`baselineFromItems` 的时间戳缺省时按序号占位，首项就是 0），
    // 真值判断会把那一轮的时长静默丢掉。
    if (meta.endedAt != null && meta.startedAt != null) {
      totalElapsedMs += meta.endedAt - meta.startedAt
      elapsedTurns += 1
    }
    if (meta.status === 'completed') completed += 1
    else if (meta.status === 'failed') failed += 1
    else if (meta.status === 'inProgress') running = true
  }

  return {
    turns: turns.length,
    completed,
    failed,
    running,
    totalTokens,
    totalElapsedMs,
    avgTurnMs: elapsedTurns > 0 ? Math.round(totalElapsedMs / elapsedTurns) : null,
  }
}

/** 上下文余量（13 号板块）。`limit === 0` 表示模型目录没填窗口。 */
export interface BudgetPressure {
  used: number
  limit: number
  ratio: number
  /** 70% / 90% 两档阈值，界面据此换色。 */
  band: 'ok' | 'warn' | 'danger'
}

export function budgetPressure(
  usage: TokenUsage,
  limit: number,
): BudgetPressure {
  // `used` 用 input + output：缓存命中的部分仍然占窗口（它要被读一遍），
  // 所以不算它进"省下来的额度"。这是 codex 的实际行为。
  const used = usage.input + usage.output
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0
  return {
    used,
    limit,
    ratio,
    band: limit <= 0 ? 'ok' : ratio >= 0.9 ? 'danger' : ratio >= 0.7 ? 'warn' : 'ok',
  }
}

// ------------------------------------------------------------------ hooks

/**
 * 订阅一个投影。
 *
 * 用 `useMemo` 而不是直接调纯函数：后者每次渲染都重算整段历史，
 * 而 `turns` 在流式期间每帧都变。没有这层 memo 时，状态栏一个 2000ms
 * 的间隔计算能让整棵消息流跟着每帧重算。
 */
export function useProjection<A extends unknown[], T>(
  project: (turns: TurnMeta[], ...args: A) => T,
  turns: TurnMeta[],
  ...args: A
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => project(turns, ...args), [turns, ...args])
}

/** 便捷封装：回合摘要。 */
export function useTurnSummaries(turns: TurnMeta[]): TurnSummary[] {
  return useMemo(() => turnSummaries(turns), [turns])
}

/** 便捷封装：跨回合累计。 */
export function useSessionStats(turns: TurnMeta[]): SessionStats {
  return useMemo(() => sessionStats(turns), [turns])
}

/** 便捷封装：上下文余量。 */
export function useBudgetPressure(usage: TokenUsage, limit: number): BudgetPressure {
  return useMemo(() => budgetPressure(usage, limit), [usage, limit])
}