/**
 * 正文类事件 → 条目：用户消息、助手正文、推理。
 *
 * 三条容易写错的规则都在这里，改动时务必照看注释：
 * 1. `textComplete` **覆盖**而非追加 `textDelta` —— 流式可能重复或回退
 * 2. 推理**没有完成事件**，只能靠回合边界收口
 * 3. 本地回显要**原子替换**并保留原时间戳
 */

import type { AgentEvent } from '../../bridge/types'
import type { AssistantEntry, Entry, ReasoningEntry, UserEntry } from '../entries'
import type { TurnState } from '../turnState'
import { claimEcho } from '../localEcho'
import { flattenUserContent, lastOf, nextId, push, replace } from './helpers'

/** 只处理正文类事件；其余返回 null 表示"不归我管"。 */
export function applyText(
  state: TurnState,
  event: AgentEvent,
  at: number,
): TurnState | null {
  switch (event.type) {
    case 'userMessage':
      return applyUserMessage(state, event, at)
    case 'textDelta':
      return applyTextDelta(state, event, at)
    case 'textComplete':
      return applyTextComplete(state, event, at)
    case 'reasoningDelta':
      return applyReasoningDelta(state, event, at)
    case 'reasoningPartAdded':
      // summary 分段标题：C 期补 summaryTextDelta 后才有内容，这里先记位。
      return state
    default:
      return null
  }
}

/**
 * 权威用户消息到达。
 *
 * 若最后一条待确认的本地回显正文相同，就地替换掉它而不是追加一条——
 * 否则用户会同时看到两条自己的消息（04 §3.2 的「原子替换」）。
 * 时间戳沿用回显那条，否则消息会「跳」到流底部。
 */
function applyUserMessage(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'userMessage' }>,
  at: number,
): TurnState {
const text = flattenUserContent(event.content)
  const pendingIndex = claimEcho(state, event.clientUserMessageId, text)

  if (pendingIndex >= 0) {
    const pending = state.entries[pendingIndex] as UserEntry
    const settled: UserEntry = {
      id: event.itemId,
      kind: 'user',
      at: pending.at,
      turn: pending.turn,
      text,
    }
    const copy = state.entries.slice()
    copy[pendingIndex] = settled
    return { ...state, entries: copy }
  }

const entry: UserEntry = { id: event.itemId, kind: 'user', at, turn: state.turn, text }
  return push(state, entry)
}

/**
 * 正文增量。
 *
 * 按 `itemId` 收口，**不是**「最后一条还在流式的 assistant」。
 *
 * 协议保证每条消息事件都带 `itemId`（`textDelta` 的它是必填，不是可选），
 * 而 `applyTextComplete` 正是按 `itemId` 覆盖的。两边口径必须一致：
 * 原来这里只看「最后一条 assistant 是否 streaming」而忽略 itemId，于是
 * item X 的 delta 被并进 item Y；等 X 的 complete 到达，`replace` 又找不到
 * X（它压根没被创建）就追加一条 —— 同一段文字出现两遍。
 *
 * 交错是真的：并行工具调用会让 A 的正文、工具、B 的正文交叉到达。
 * `itemId` 缺失时（协议不该发生）才退回 streaming 启发式，保证不崩。
 */
function applyTextDelta(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'textDelta' }>,
  at: number,
): TurnState {
  // 从后往前按 `id` 找：流式命中的就是最后那条，正序扫描在长会话里每条
  // delta 都要走一遍全表。（注意正文/推理条目的 id 存在 `e.id`，不是
  // `itemId`——`findByItemId` 是给工具条目用的，别拿它来找这两类。）
  const byId = event.itemId
    ? reverseFind(state.entries, 'assistant', event.itemId)
    : undefined

  if (byId && byId.streaming) {
    return {
      ...state,
      streamingAssistantId: byId.id,
      entries: replace(state.entries, { ...byId, text: byId.text + event.delta }),
    }
  }

  // 没有同 id 的条目，**或者**那条已经收口（`textComplete` 到过了）。
  //
  // 已收口还来 delta 的协议不该发生；但真发生时不能去改一条已完结的消息——
  // 那会让「最终正文」被静默追加，且条目仍标着 `streaming: false`，
  // 自相矛盾。所以另起一条，并换一个唯一 id（沿用原 id 会在 React 侧撞 key）。
  const last = lastOf(state.entries, 'assistant')
  if (last && last.streaming && !byId && !event.itemId) {
    return {
      ...state,
      streamingAssistantId: last.id,
      entries: replace(state.entries, { ...last, text: last.text + event.delta }),
    }
  }

  const created: AssistantEntry = {
    id: byId ? nextId('asst') : event.itemId || nextId('asst'),
    kind: 'assistant',
    at,
    turn: state.turn,
    text: event.delta,
    streaming: true,
  }
  return { ...push(state, created), streamingAssistantId: created.id }
}

/**
 * 完成事件**覆盖**正文。
 *
 * 这是最容易写错的一处：追加会在上游重发或流式回退时产生重复段落，
 * 用户看到的是同一段话出现两遍。
 */
function applyTextComplete(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'textComplete' }>,
  at: number,
): TurnState {
  const id = event.itemId || state.streamingAssistantId || nextId('asst')
  const existing = state.entries.find((e) => e.id === id)
  const entry: AssistantEntry = {
    id,
    kind: 'assistant',
    at: existing?.at ?? at,
    turn: existing?.turn ?? state.turn,
    text: event.text,
    streaming: false,
  }
  return {
    ...state,
    entries: replace(state.entries, entry),
    streamingAssistantId: null,
  }
}

/**
 * 推理增量。
 *
 * 没有完成事件，所以 `streaming` 只能靠 `turnComplete` 清——
 * 提前收口会在推理被工具调用打断时把后续分段截掉。
 *
 * 同样按 `itemId` 收口。原来的实现连 `streaming` 都不看，只管往
 * 「最后一条 reasoning」上追加：一轮里出现第二段推理后，第一段恢复时
 * （并行工具调用就会这样交错）它的内容被追加进第二段，两段推理混成一条。
 */
function applyReasoningDelta(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'reasoningDelta' }>,
  at: number,
): TurnState {
  const byId = reverseFind(state.entries, 'reasoning', event.itemId)
  // 只往**还在流式**的条目上追加：已收口（turnComplete 把 streaming 清掉）
  // 的推理段不该被迟到的 delta 改写——那与正文侧「不改已完结消息」是同一条
  // 不变式（见 applyTextDelta 的注释）。
  if (byId && byId.streaming) {
    return {
      ...state,
      entries: replace(state.entries, {
        ...byId,
        text: byId.text + event.delta,
        isSummary: event.isSummary || byId.isSummary,
      }),
    }
  }

  const last = event.itemId ? undefined : lastOf(state.entries, 'reasoning')
  const reusable = last && last.streaming ? last : undefined
  if (reusable) {
    return {
      ...state,
      entries: replace(state.entries, {
        ...reusable,
        text: reusable.text + event.delta,
        isSummary: event.isSummary || reusable.isSummary,
      }),
    }
  }

  const entry: ReasoningEntry = {
    // 同 id 的已收口条目还在时不能沿用原 id：replace 会把已完结的那段整个
    // 覆盖掉，且 React 侧撞 key。另起一个唯一 id。
    id: byId ? nextId('reason') : (event.itemId || nextId('reason')),
    kind: 'reasoning',
    at,
    turn: state.turn,
    text: event.delta,
    streaming: true,
    isSummary: event.isSummary,
  }
  return { ...state, entries: replace(state.entries, entry) }
}

/**
 * 从后往前按 `id` 找同 kind 的条目。
 *
 * 与 `helpers.findByItemId` 的区别：那个按 `itemId` **字段**找（工具条目），
 * 而正文 / 推理条目的 id 存在 `e.id` 上。从后往前是因为流式命中的总是最后
 * 那条，正序扫描在长会话里每条 delta 都要走一遍全表。
 */
function reverseFind<T extends Entry['kind']>(
  entries: Entry[],
  kind: T,
  id: string | undefined,
): Extract<Entry, { kind: T }> | undefined {
  if (!id) return undefined
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e && e.kind === kind && e.id === id) return e as Extract<Entry, { kind: T }>
  }
  return undefined
}