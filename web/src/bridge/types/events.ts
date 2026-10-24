/**
 * 事件契约：Rust 侧 `codex` 产生的每一种事件，在前端的形状。
 *
 * ## 为什么不自动生成
 *
 * Rust 侧导出 TS 需要额外构建步骤（`ts-rs`），而事件契约本身已被
 * `proto/manifest.json` + `tools/check_wire_parity.py` 守住。手写换来的是
 * 「改了 Rust 侧忘了改 TS」时能立刻编译失败。
 *
 * ## 联合的分组
 *
 * `AgentEvent` 由四组组成，各组的**处理约定**不同，所以拆开声明：
 * - `messageEvents.ts` → 进 reducer，长成条目
 * - `serverRequestEvents.ts` → 除此之外还必须走一条 `bridge_respond_*`
 * - `eventPayloads.ts` + `ChannelEvent` → 只更新右栏缓存，不进消息流
 * - 本文件的 Goal/Terminal/Debug → 各自有专门的 store
 *
 * ## 联合里没有兜底成员
 *
 * 加一个带索引签名的 `{ type: string; [k: string]: unknown }` 会让**所有**
 * 已知字段的访问都被拓宽成 `unknown`，等于放弃类型检查。未知变体改走
 * `UnknownEvent` + 运行时分流。
 */

import type { HookPromptFragment, ThreadId, TurnId } from './core'
import type { MessageEvent } from './messageEvents'
import type { ServerRequestEvent } from './serverRequestEvents'
import type {
  GuardEventPayload,
  HostEventPayload,
  ThreadEventPayload,
} from './eventPayloads'

export type { GuardEventPayload, HostEventPayload, MessageEvent, ThreadEventPayload }

/** 所有事件共有的字段。 */
export interface AgentEventBase {
  type: string
  threadId?: ThreadId
  turnId?: TurnId
}

/**
 * 目标（07 号文件）。
 *
 * `goal` 是整个 Goal 对象，原样透传：上游加字段时前端不用改桥接层，
 * 只在要用的时候多读一个属性。
 */
export interface GoalEvent extends AgentEventBase {
  type: 'goalEvent'
  kind: 'updated' | 'cleared'
  goal: unknown | null
}

/**
 * 终端输出与进程退出（10 号文件）。
 *
 * 独立于 `ChannelEvent`：输出是高频的，混进右栏通道会让资源面板跟着重渲染。
 */
export interface TerminalEvent extends AgentEventBase {
  type: 'terminalEvent'
  /** codex 侧的 exec / process id，应答与 resize 都按它关联。 */
  execId: string
  stream?: string
  delta?: string
  /** 输出被截断：界面要显示「已截断」，否则用户以为程序没输出那么多。 */
  capReached?: boolean
  exitCode?: number | null
  /** 进程退出（区别于「还有输出但暂时没来」）。 */
  exited?: boolean
  origin?: 'commandExec' | 'process'
}

/**
 * 原始响应与审核元数据（06 号文件的事件账本）。
 *
 * 只进账本，不进消息流——这些东西给用户看没有意义，但出问题时
 * 「上游到底发了什么」是唯一能查的。
 */
export interface DebugEvent extends AgentEventBase {
  type: 'debugEvent'
  method: string
  payload: unknown
}

/**
 * 通道事件：不进消息流，只喂右栏 / 账本。
 *
 * 与消息流事件分开是因为它们**生命周期不同**：消息流事件驱动界面渲染，
 * 这几类只更新资源面板的缓存。混在一个大联合里容易让 reducer 忘了
 * 「这几种不该往消息流塞」。
 */
export type ChannelEvent =
  | (AgentEventBase & { type: 'threadEvent'; event: ThreadEventPayload })
  | (AgentEventBase & { type: 'hostEvent'; method: string; event: HostEventPayload })
  | (AgentEventBase & { type: 'guardEvent'; method: string; event: GuardEventPayload })
  | (AgentEventBase & { type: 'hook'; itemId: string; fragments: HookPromptFragment[] })

/** 全部已知事件。 */
export type AgentEvent =
  | MessageEvent
  // 必须应答的一组：审批、客户端工具、提问、未知宿主能力。
  | ServerRequestEvent
  | GoalEvent
  | TerminalEvent
  | DebugEvent
  | ChannelEvent

/**
 * 上游新增、本仓库尚未建模的事件变体。
 *
 * 运行时落到这里：界面透传，不崩溃也不显示未知控件。
 */
export interface UnknownEvent extends AgentEventBase {
  type: string
  [key: string]: unknown
}

/** 事件通道的负载：已知变体 + 未知变体。 */
export type AnyEvent = AgentEvent | UnknownEvent

/**
 * 已知变体名集合，与 `AgentEvent` 联合**手写保持同步**。
 *
 * 类型系统帮不上这里的忙（`'x' extends AgentEvent['type']` 查不出联合的全部
 * 成员）。加一个事件变体时记得两处都改：漏了的后果是它落进 `UnknownEvent`，
 * 界面透传不崩溃，但走不了对应的处理器。
 */
const KNOWN = new Set<string>([
  // 消息流
  'turnStarted', 'textDelta', 'textComplete', 'reasoningDelta',
  'reasoningPartAdded', 'userMessage', 'turnComplete', 'error', 'warning',
  'tokenUsage', 'toolCallStart', 'toolCallDelta', 'toolCallEnd',
  'fileEdit', 'fileEditPatch', 'fileChangeOutput', 'functionCallOutput',
  'planUpdated', 'planDelta', 'planItem', 'contextCompacted', 'turnDiffUpdated',
  'subAgentActivity', 'reviewMode', 'serverRequestResolved',
  'sleep', 'imageView', 'imageGeneration', 'unhandled',
  // 必须应答的一组
  'approvalRequested', 'toolCallRequested', 'hostCapabilityRequested',
  'userInputRequested', 'elicitationRequested',
  // 通道与专用通道
  'goalEvent', 'terminalEvent', 'debugEvent',
  'threadEvent', 'hostEvent', 'guardEvent', 'hook',
])

/** 判断一个事件是否是我们已建模的变体（清单的同步约定见 `KNOWN` 上方）。 */
export function isKnownEvent(event: AnyEvent): event is AgentEvent {
  return KNOWN.has(event.type)
}