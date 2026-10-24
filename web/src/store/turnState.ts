/**
 * 回合态：一次 turn 的元信息、用量、以及消息流的容器状态。
 *
 * 与 `entries.ts` 分开是因为两者会分别长：条目跟着协议的工具种类加，
 * 回合态跟着「一个 turn 要展示哪些维度」加（rail、用量、计划…）。
 * 混在一个文件里，最后一定是回合态那部分被条目淹没。
 */

import type { PlanStep, TurnStatus } from '../bridge/types'
import type { ApprovalEntry, Entry } from './entries'

/**
 * 回合内累计的 token 用量。`cached` 单列——它决定了下一轮的实际花费，
 * 混在 total 里看不出来。
 */
export interface TokenUsage {
  total: number
  input: number
  cached: number
  output: number
  reasoning: number
}

export const ZERO_USAGE: TokenUsage = { total: 0, input: 0, cached: 0, output: 0, reasoning: 0 }

/** 一个回合的元信息。turn rail 与用量面板都从这里取数。 */
export interface TurnMeta {
  index: number
  /** 协议 turnId；本地还没拿到时为 null。 */
  turnId: string | null
  startedAt: number
  endedAt: number | null
  status: TurnStatus | 'pending'
  /** 首条用户消息前 60 字，用作 rail 的悬浮预览与回合折叠标题。 */
  preview: string
  /** 结束时的用量快照；还在跑则为 null。 */
  usage: TokenUsage | null
}

/** 当前回合的计划。独立于消息流，渲染在顶部的计划面板里。 */
export interface PlanState {
  steps: PlanStep[]
  explanation?: string | null
  /** `item/plan/delta` 的增量正文，尚未并入 steps。 */
  draft: string
}

export interface TurnState {
  entries: Entry[]
  plan: PlanState
  /** 正在流式输出的助手消息 id，用于折叠与光标定位。 */
  streamingAssistantId: string | null
  /** 是否有待应答的审批。有则输入区禁用。 */
  pendingApproval: ApprovalEntry | null
  turnActive: boolean
  /** 当前回合序号，条目打戳用。 */
  turn: number
  /** 当前回合的协议 turnId；还没拿到（本地回显）时为 null。 */
  turnId: string | null
  /** 本回合累计用量；turnComplete 时冻结进 turns。 */
  usage: TokenUsage
  /** 回合列表（新→旧）。turn rail 的数据源。 */
  turns: TurnMeta[]
  seq: number
}

export function emptyPlan(): PlanState {
  return { steps: [], explanation: null, draft: '' }
}

export function emptyTurnState(): TurnState {
  return {
    entries: [],
    plan: emptyPlan(),
    streamingAssistantId: null,
    pendingApproval: null,
    turnActive: false,
    turn: 0,
    turnId: null,
    usage: { ...ZERO_USAGE },
    turns: [],
    seq: 0,
  }
}

/** rail 的悬浮预览长度。别更长——浮层宽度有限，截了也看不清。 */
export const PREVIEW_CHARS = 60

export function previewOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > PREVIEW_CHARS ? flat.slice(0, PREVIEW_CHARS) + '…' : flat
}