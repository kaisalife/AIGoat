/**
 * 事件载荷的**子结构**（不进 `AgentEvent` 联合的那些）。
 *
 * 与 `events.ts` 分开是因为它们体量不小（channel payload 一百多行），
 * 而联合本身还要再长。分开后 `events.ts` 只剩「有哪些事件」，
 * 这里只答「某类事件的载荷长什么样」——两个问题分开看更清楚。
 *
 * 载荷一律**宽类型**（`unknown` / 可选字段）而不是逐字段建模：
 * 这些结构由 codex 决定，我们只是搬运。写死了上游加字段就编译失败，
 * 不写就只是多一个暂时用不到的字段——后者显然更好。
 */

import type { HookPromptFragment } from './core'

/** thread/* 通知的载荷。`kind` 决定其余字段哪个有值。 */
export type ThreadEventKind =
  | 'started' | 'closed' | 'deleted' | 'archived' | 'unarchived' | 'reverted'
  | 'renamed' | 'projectChanged' | 'attachmentChanged' | 'statusChanged'
  | 'queueChanged' | 'settingsChanged' | 'compacted'
  | 'environmentConnected' | 'environmentDisconnected'
  | 'goalUpdated' | 'goalCleared'

export interface ThreadEventPayload {
  kind: ThreadEventKind
  threadName?: string | null
  projectId?: string | null
  statusType?: string
  activeFlags?: string[]
  attachmentType?: string
  identityKey?: string
  attachmentId?: string
  operation?: string
  environmentId?: string
  goal?: unknown
  turnId?: string
}

export type HostEventKind =
  | 'fsChanged' | 'projectChanged' | 'skillsChanged' | 'output'
  | 'processExited' | 'terminalInteraction' | 'mcpProgress' | 'fileChangeOutput'

export interface HostEventPayload {
  kind: HostEventKind
  watchId?: string
  changedPaths?: string[]
  projectId?: string
  changeType?: string
  origin?: 'commandExec' | 'process'
  handle?: string
  stream?: string
  deltaBase64?: string
  capReached?: boolean
  exitCode?: number
  stdout?: string
  stderr?: string
  stdoutCapReached?: boolean
  stderrCapReached?: boolean
  threadId?: string
  turnId?: string
  itemId?: string
  processId?: string
  stdin?: string
  message?: string
  delta?: string

  // 下面这些是 `map/host.rs` 一直在发、但这里从前没声明的字段。
  // 事件是跨桥过来的 JSON，类型系统抓不到"多出来的字段"，于是类型在
  // 骗人：读 `payload.name` 会被当成不存在，用 `as` 硬转又绕过了检查。
  // 与其到处加断言，不如把实际到达的字段如实列出来——多声明可选字段
  // 不改变任何运行时行为。

  /** `mcpServer/*`：MCP 服务器身份与状态。 */
  name?: string
  status?: string
  error?: string | null
  /** `skills/changed`：技能目录所在的 cwd。 */
  cwd?: string
  /** `hook/started` 与 `hook/completed`：钩子运行。两者成对，用 phase 区分。 */
  phase?: 'started' | 'completed' | 'updated'
  runId?: string
  eventName?: string
  handlerType?: string
  statusMessage?: string | null
  startedAt?: number
  completedAt?: number | null
  durationMs?: number | null
  /** `fuzzyFileSearch/session*`：模糊搜索会话（08 号板块二期消费）。 */
  sessionId?: string
  query?: string
  files?: FuzzyMatch[]
}

/**
 * guard 事件：模型侧与安全状态的变化。
 *
 * 与 HostEvent 的界线：host 报「宿主资源的状态」，guard 报「模型/安全
 * 状态的变化」。两者都发给右栏，但用户看到的是两件事。
 */
export type GuardEventKind =
  | 'strictReviewRequired' | 'review' | 'sandboxSetupCompleted'
  | 'worldWritableWarning' | 'modelRerouted' | 'modelVerified'
  | 'safetyBuffering' | 'authRecovery'

export interface GuardEventPayload {
  kind: GuardEventKind
  threadId?: string
  turnId?: string
  startedAtMs?: number
  completedAtMs?: number
  reviewId?: string
  targetItemId?: string | null
  phase?: 'started' | 'completed'
  status?: string | null
  riskLevel?: string | null
  userAuthorization?: string | null
  rationale?: string | null
  action?: unknown
  mode?: string
  success?: boolean
  error?: string | null
  samplePaths?: string[]
  extraCount?: number
  failedScan?: boolean
  fromModel?: string
  toModel?: string
  reason?: string
  verifications?: string[]
  model?: string
  useCases?: string[]
  reasons?: string[]
  showBufferingUi?: boolean
  fasterModel?: string | null
  provider?: string
  message?: string
}

/**
 * hook 运行载荷。
 *
 * 注意：`hostEvent` 的 `kind: 'output'` 有多个来源共用（hook 的 started/
 * completed、模糊文件搜索的 updated/completed），靠 `phase` 区分——所以判别
 * 哪种来源要连 `phase` 一起看。
 */
export interface HookRunPayload {
  kind: 'hook'
  phase: 'started' | 'completed'
  threadId: string
  turnId?: string | null
  runId: string
  eventName: string
  handlerType: string
  status: string
  statusMessage?: string | null
  startedAt?: number
  completedAt?: number | null
  durationMs?: number | null
  entries?: unknown[]
}

export interface FuzzyMatch {
  kind: 'match'
  root: string
  path: string
  matchType: string
  fileName: string
  score: number
  indices?: number[] | null
}

// 这里曾经还有一套 `Host4EventKind` / `Host4EventPayload` 与 `host4Event`
// 变体，已删除：`map/host.rs` 把它发出的那 9 种 kind（mcpStartup、hook、
// rawResponse、fuzzySearch* 等）全部挂在 `hostEvent` 上，`HostEventKind` 已经
// 覆盖；而 Rust 侧搜不到任何 `host4`，即没有任何地方发出过 `host4Event`。
// 留着的结果是 `summarize.ts` 里有个按类型永远不可达的 case，而看代码的人
// 会以为还有一整条通道没接。
//
// 要接新通道时按 `hostEvent` 的路子加：Rust 用 `wrap("hostEvent", ...)`，
// 前端在 `HostEventKind` 与 `HostEventPayload` 上补kind 与字段。

export type { HookPromptFragment }