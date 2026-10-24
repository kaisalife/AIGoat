/**
 * 回合类事件 → 回合态：边界、计划、审批、子 Agent。
 *
 * 回合边界是这里唯一有"顺序要求"的地方：`turnStarted` 必须先把上一回合
 * 冻结进 `turns`（给 rail 用），`turnComplete` 才累加 `turn` 计数器。
 * 顺序颠倒会让 rail 上出现两个一模一样的节点。
 *
 * 提示类事件（error/warning/压缩/等待…）在 `notice.ts`。
 */

import type { AgentEvent } from '../../bridge/types'
import type { ApprovalEntry } from '../entries'
import { emptyPlan, previewOf, type TokenUsage, type TurnMeta, type TurnState } from '../turnState'
import { nextId, nextPendingApproval, push, withPlan } from './helpers'

export function applyTurn(
  state: TurnState,
  event: AgentEvent,
  at: number,
): TurnState | null {
  switch (event.type) {
    case 'turnStarted':
      return startTurn(state, event)
    case 'turnComplete':
      return completeTurn(state, event)
    case 'tokenUsage':
      return addUsage(state, event)
    case 'planUpdated':
      return withPlan(state, { steps: event.steps, explanation: event.explanation, draft: '' })
    case 'planDelta':
      return withPlan(state, { draft: state.plan.draft + event.delta })
    case 'planItem':
      return withPlan(state, { draft: state.plan.draft + event.text })
    case 'approvalRequested':
      return requestApproval(state, event, at)
    case 'serverRequestResolved':
      return resolveServerRequest(state, event)
    case 'subAgentActivity':
      return push(state, {
        id: event.itemId,
        kind: 'subAgent',
        at,
        turn: state.turn,
        agentThreadId: event.agentThreadId,
        agentPath: event.agentPath,
        activity: event.kind,
      })
    case 'reviewMode':
      return push(state, {
        id: event.itemId,
        kind: 'reviewMode',
        at,
        turn: state.turn,
        mode: event.mode,
        review: event.review,
      })
    // 图片事件在 C 期就已映射，但这里之前**没有 case** —— 也就是说它们一直是
    // 静默丢弃的：模型显示了图，界面上什么都不出现。11 号板块 §3.3 补渲染。
    case 'imageView':
      if (!event.path) return null
      return push(state, {
        id: event.itemId,
        kind: 'imageView',
        at,
        turn: state.turn,
        path: event.path,
      })
    case 'imageGeneration':
      return push(state, {
        id: event.itemId,
        kind: 'imageGeneration',
        at,
        turn: state.turn,
        status: event.status ?? 'completed',
        revisedPrompt: event.revisedPrompt ?? null,
        result: event.result ?? null,
        savedPath: event.savedPath ?? null,
        failure: event.failure ?? null,
      })
    default:
      return null
  }
}

function startTurn(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'turnStarted' }>,
): TurnState {
  const meta: TurnMeta = {
    index: state.turn,
    turnId: event.turnId,
    startedAt: Date.now(),
    endedAt: null,
    status: 'inProgress',
    preview: previewOf(lastUserText(state)),
    usage: null,
  }
  return {
    ...state,
    turnActive: true,
    turnId: event.turnId,
    // 新回合清掉上一轮的计划面板：它是「本回合要做什么」，不是全局状态。
    plan: emptyPlan(),
    usage: { total: 0, input: 0, cached: 0, output: 0, reasoning: 0 },
    turns: [...state.turns, meta],
    entries: state.entries.length
      ? [
          ...state.entries,
          { id: nextId('div'), kind: 'divider', label: '回合开始', at: Date.now(), turn: state.turn },
        ]
      : state.entries,
  }
}

function completeTurn(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'turnComplete' }>,
): TurnState {
  const turns = state.turns.map((t, i) =>
    i === state.turns.length - 1
      ? { ...t, status: event.status, endedAt: Date.now(), usage: state.usage }
      : t,
  )
  // 没有还在流式的推理段时保持 entries 引用不变：无条件 map 会每个回合边界
  // 都造一个新数组，所有以 entries 为依赖的 memo/选择器被迫全部重算。
  const hasStreamingReasoning = state.entries.some(
    (e) => e.kind === 'reasoning' && e.streaming,
  )
  return {
    ...state,
    turnActive: false,
    streamingAssistantId: null,
    // 计数前进是「下一条事件属于下一回合」的信号，所以放在完成时。
    turn: state.turn + 1,
    turns,
    entries: hasStreamingReasoning
      ? state.entries.map((e) =>
          e.kind === 'reasoning' && e.streaming ? { ...e, streaming: false } : e,
        )
      : state.entries,
  }
}

function addUsage(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'tokenUsage' }>,
): TurnState {
  const usage: TokenUsage = {
    total: event.totalTokens,
    input: event.inputTokens,
    cached: event.cachedInputTokens,
    output: event.outputTokens,
    reasoning: event.reasoningOutputTokens,
  }
  // 协议报的是**本回合**的累计值，不是增量，所以直接覆盖而非累加。
  return { ...state, usage }
}

function requestApproval(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'approvalRequested' }>,
  at: number,
): TurnState {
  const entry: ApprovalEntry = {
    id: event.itemId || `appr-${String(event.requestId)}`,
    kind: 'approval',
    at,
    turn: state.turn,
    itemId: event.itemId,
    requestId: event.requestId,
    approvalKind: event.approvalKind,
    command: event.command,
    cwd: event.cwd,
    reason: event.reason,
    state: 'pending',
  }
  // 有待审批时输入区必须禁用：审批前继续发消息会产生竞态。
  return { ...push(state, entry), pendingApproval: entry }
}

/**
 * 审批在 `serverRequestResolved` 才算定稿，**不靠超时兜底**。
 *
 * 超时兜底看起来更"健壮"，实际后果是：网络慢时卡片先显示已处理，
 * 而真正的应答还没发出去，用户再点一次就变成了两次应答。
 *
 * 按 `requestId` 找条目，而不是读单一槽位：同时可能有多条审批在等，
 * 而且这条通知也可能对应一条**用户没在本机应答**的审批（比如另一窗口）。
 * 已经本地定过稿的（approved/declined）不在这里改写。
 */
function resolveServerRequest(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'serverRequestResolved' }>,
): TurnState {
  const index = state.entries.findIndex(
    (e) => e.kind === 'approval' && e.requestId === event.requestId,
  )
  if (index < 0) return state
  const target = state.entries[index] as ApprovalEntry
  if (target.state !== 'pending') return state
  const copy = state.entries.slice()
  copy[index] = { ...target, state: 'approved', decision: '已应答' }
  return { ...state, entries: copy, pendingApproval: nextPendingApproval(copy) }
}

/** 回合的预览文案取自最后一条用户消息——那是这一轮"在问什么"。 */
function lastUserText(state: TurnState): string {
  for (let i = state.entries.length - 1; i >= 0; i--) {
    const e = state.entries[i]
    if (e?.kind === 'user') return e.text
  }
  return ''
}