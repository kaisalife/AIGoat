/**
 * 工具类事件 → 条目：工具调用、宿主工具、文件变更、回合 diff、函数输出。
 *
 * 这里只关心「一条工具线怎么从开始走到结束」。工具卡长什么样是 05 板块
 * 的事，本文件不碰渲染。
 */

import type { AgentEvent, FileChange } from '../../bridge/types'
import type {
  DiffEntry,
  FunctionOutputEntry,
  ToolCallEntry,
  ToolEntry,
} from '../entries'
import type { TurnState } from '../turnState'
import { findByItemId, lastOf, nextId, push, replace, textOf } from './helpers'

export function applyTool(
  state: TurnState,
  event: AgentEvent,
  at: number,
): TurnState | null {
  switch (event.type) {
    case 'toolCallStart':
      return applyToolStart(state, event, at)
    case 'toolCallDelta':
      return applyToolDelta(state, event)
case 'toolCallEnd':
      return applyToolEnd(state, event)
    case 'toolCallRequested':
      return push(state, toolCallEntry(state, event, at))
    case 'functionCallOutput':
      return applyFunctionOutput(state, event, at)
    case 'fileEdit':
      return push(state, {
        id: event.itemId,
        kind: 'fileEdit',
        at,
        turn: state.turn,
        itemId: event.itemId,
        changes: event.changes,
        status: event.status,
      })
case 'fileChangeOutput': {
      // 文件写入的逐行输出是"补丁在写"的旁路，不是独立条目，单独渲染只会
      // 多一行噪音——所以这里**有意什么都不做**。
      //
      // 原实现写成 `replace(entries, lastOf(entries, 'fileEdit'))`：内容上
      // 等于没改，却每次都复制一份 entries 数组并造出新 state，于是每来一条
      // （这是高频流）整条消息流就重渲染一次。改成直接返回原 state，
      // 引用不变，React 自然跳过。
      void event
      return state
    }
    case 'fileEditPatch':
      return applyFileEditPatch(state, event, at)
    case 'turnDiffUpdated':
      return applyTurnDiff(state, event, at)
    default:
      return null
  }
}

function applyToolStart(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'toolCallStart' }>,
  at: number,
): TurnState {
  const entry: ToolEntry = {
    id: event.itemId,
    kind: 'tool',
    at,
    turn: state.turn,
    itemId: event.itemId,
    toolKind: event.toolKind,
    name: event.name,
    input: event.input,
    output: '',
    status: 'inProgress',
    streaming: true,
  }
  return push(state, entry)
}

function applyToolDelta(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'toolCallDelta' }>,
): TurnState {
  // 按 itemId 定位，**不是**「最后一条工具」——并行调用时先开始的那个会被漏掉。
  const hit = findByItemId(state.entries, 'tool', event.itemId)
  if (!hit) return state
  const last = hit.entry
  // MCP 进度与输出是**两条流**（05 号板块 §3.2）：进度是"正在做什么"的
  // 人话，混进 output 会让最终结果被进度文案污染。
  if (event.stream === 'progress') {
    return {
      ...state,
      entries: replace(state.entries, { ...last, progress: appendLine(last.progress, event.delta) }),
    }
  }
  return {
    ...state,
    entries: replace(state.entries, { ...last, output: last.output + event.delta }),
  }
}

/** 进度按行累积：同一句重复上报（MCP 常这么干）不该显示两遍。 */
function appendLine(current: string | undefined, delta: string): string {
  if (!current) return delta
  // 只与**最后一行**比较。用 `current.endsWith(delta)` 会把「delta 恰好是
  // 累计文本的后缀」误判成重复——例如累计到 "Fetch" 后再来一个 "g" 就被吞掉。
  const lastLine = current.slice(current.lastIndexOf('\n') + 1)
  return lastLine === delta ? current : `${current}\n${delta}`
}

function applyToolEnd(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'toolCallEnd' }>,
): TurnState {
  const hit = findByItemId(state.entries, 'tool', event.itemId)
  if (!hit) return state
  const entry: ToolEntry = {
    ...hit.entry,
    status: event.status,
    exitCode: event.exitCode ?? hit.entry.exitCode,
    durationMs: event.durationMs ?? hit.entry.durationMs,
    error: event.error ?? hit.entry.error,
    // 服务端给了完整输出就以它为准，否则保留累积的流式文本。
    output: textOf(event.output) ?? hit.entry.output,
    streaming: false,
  }
  return { ...state, entries: replace(state.entries, entry) }
}

/**
 * 客户端工具调用条目。
 *
 * 语义是「codex 在等宿主的答复」，所以**必须应答**——不答那一轮永远挂着，
 * 界面上表现为 Agent 一直转圈。状态由执行器自己推进（`slices/turns.ts`），
 * 没有 codex 发来的"工具完成"通知，因为工具跑在宿主这边。
 */
function toolCallEntry(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'toolCallRequested' }>,
  at: number,
): ToolCallEntry {
  return {
    id: `tcall-${String(event.requestId)}`,
    kind: 'toolCall',
    at,
    turn: state.turn,
    requestId: event.requestId,
    callId: event.callId,
    tool: event.tool,
    namespace: event.namespace,
    arguments: event.arguments,
    status: 'running',
    output: '',
  }
}

/** 函数回传独立成条：它是工具执行的结果，不是工具本身。 */
function applyFunctionOutput(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'functionCallOutput' }>,
  at: number,
): TurnState {
  const entry: FunctionOutputEntry = {
    id: event.itemId,
    kind: 'functionOutput',
    at,
    turn: state.turn,
    name: event.name,
    namespace: event.namespace,
    output: textOf(event.output) ?? '',
  }
  return push(state, entry)
}

/**
 * 补丁增量：并进**对应那次**文件变更，不新增消息。
 *
 * 原来并的是「最后一条 fileEdit」。并行改多个文件时，补丁会挂到别的文件上——
 * 事件自带 `itemId`，按 id 收口才准。找不到对应条目时退化成一条 diff 条目：
 * 丢内容比多一条更糟。
 */
function applyFileEditPatch(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'fileEditPatch' }>,
  at: number,
): TurnState {
  const hit = findByItemId(state.entries, 'fileEdit', event.itemId)
  if (!hit) return push(state, diffEntry(event.changes, at, nextId('patch'), state.turn))
  return {
    ...state,
    entries: replace(state.entries, {
      ...hit.entry,
      changes: [...hit.entry.changes, ...event.changes],
    }),
  }
}

function applyTurnDiff(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'turnDiffUpdated' }>,
  at: number,
): TurnState {
  // 只并进**本回合**的最后一条 diff：上一回合残留的 diff 不该被本回合的
  // 增量覆盖掉（`lastOf` 不看 turn，切过会话就会串）。
  const last = lastOf(state.entries, 'diff')
  const target = last && last.turn === state.turn ? last : undefined
  const entry = diffEntry(
    [{ path: '', diff: event.diff, kind: 'update' }],
    target?.at ?? at,
    target?.id ?? nextId('diff'),
    state.turn,
  )
  return { ...state, entries: replace(state.entries, entry) }
}

function diffEntry(
  changes: FileChange[],
  at: number,
  id: string,
  turn: number,
): DiffEntry {
  return { id, kind: 'diff', at, turn, diff: changes.map((c) => c.diff).join('\n') }
}