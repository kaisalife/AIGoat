/**
 * 消息流事件：驱动界面渲染的那一组。
 *
 * 与 `serverRequestEvents.ts`（必须应答的一组）、`eventPayloads.ts`（通道载荷）
 * 分开，是因为三者的**处理约定**不同：
 * - 消息流：进 reducer，长成条目
 * - 必须应答：进 reducer 之外，还要走一条 `bridge_respond_*`
 * - 通道载荷：只更新右栏缓存，不进消息流
 *
 * 混在一个联合里，reducer 里就容易漏掉"这几种不该往消息流塞"。
 *
 * 联合里没有兜底成员：加一个带索引签名的 `{ type: string; [k: string]: unknown }`
 * 会让**所有**已知字段的访问都被拓宽成 `unknown`，等于放弃类型检查。未知变体
 * 改走 `UnknownEvent` + 运行时分流（见 `events.ts`）。
 */

import type {
  FileChange,
  PlanStep,
  ReviewMode,
  ToolKind,
  ToolStatus,
  TurnId,
  TurnStatus,
} from './core'
import type { AgentEventBase } from './events'

export type MessageEvent =
  // ------------------------------------------------------------ 回合边界
  // （原先这里还有个 `ready` 事件——旧的握手表征。现在握手信息由
  //  `bridge_connect` 的应答直接给（`ConnectInfo`），Rust 侧从不发 `ready`，
  //  它只在类型里挂着、没有任何处理器，故删除。）
  | (AgentEventBase & { type: 'turnStarted'; turnId: TurnId })
  | (AgentEventBase & { type: 'turnComplete'; status: TurnStatus; error?: unknown })

  // --------------------------------------------------------------- 正文
  | (AgentEventBase & { type: 'textDelta'; itemId: string; delta: string })
  | (AgentEventBase & { type: 'textComplete'; itemId: string; text: string })
  | (AgentEventBase & {
      type: 'reasoningDelta'
      itemId: string
      delta: string
      isSummary: boolean
    })
  | (AgentEventBase & { type: 'reasoningPartAdded'; itemId: string; summaryIndex: number })
  | (AgentEventBase & {
      type: 'userMessage'
      itemId: string
      content: unknown[]
      /**
       * 客户端消息 id（	urn/start.clientUserMessageId）。协议在 item 上不一定
       * 回传它，所以它可能缺失——收口逻辑要能只靠正文匹配。
       */
      clientUserMessageId?: string
    })

  // --------------------------------------------------------------- 工具
  | (AgentEventBase & {
      type: 'toolCallStart'
      itemId: string
      toolKind: ToolKind
      name: string
      input?: unknown
    })
  | (AgentEventBase & { type: 'toolCallDelta'; itemId: string; delta: string; stream?: string })
  | (AgentEventBase & {
      type: 'toolCallEnd'
      itemId: string
      toolKind: ToolKind
      name: string
      status: ToolStatus
      exitCode?: number | null
      durationMs?: number | null
      output?: unknown
      error?: string | null
    })
  | (AgentEventBase & { type: 'fileChangeOutput'; itemId: string; stream?: string; delta: string })
  | (AgentEventBase & {
      type: 'functionCallOutput'
      itemId: string
      name: string
      namespace?: string | null
      output: unknown
    })

  // --------------------------------------------------------------- 文件
  | (AgentEventBase & { type: 'fileEdit'; itemId: string; changes: FileChange[]; status: string })
  | (AgentEventBase & { type: 'fileEditPatch'; itemId: string; changes: FileChange[] })

  // --------------------------------------------------------------- 计划
  | (AgentEventBase & { type: 'planUpdated'; explanation?: string | null; steps: PlanStep[] })
  | (AgentEventBase & { type: 'planDelta'; itemId: string; delta: string })
  | (AgentEventBase & { type: 'planItem'; itemId: string; text: string })

  // ------------------------------------------------------- 上下文与压缩
  | (AgentEventBase & {
      type: 'tokenUsage'
      totalTokens: number
      inputTokens: number
      cachedInputTokens: number
      outputTokens: number
      reasoningOutputTokens: number
    })
  | (AgentEventBase & { type: 'contextCompacted'; itemId: string })
  | (AgentEventBase & { type: 'turnDiffUpdated'; diff: string })

  // -------------------------------------------------------- 子代理与复核
  | (AgentEventBase & {
      type: 'subAgentActivity'
      itemId: string
      kind: string
      agentThreadId: string
      agentPath: string
    })
  | (AgentEventBase & { type: 'reviewMode'; itemId: string; mode: ReviewMode; review: string })
  | (AgentEventBase & { type: 'serverRequestResolved'; requestId: unknown })

  // --------------------------------------------------------------- 其它
  | (AgentEventBase & { type: 'sleep'; itemId: string; durationMs: number })
  | (AgentEventBase & { type: 'imageView'; itemId: string; path: string })
  | (AgentEventBase & {
      type: 'imageGeneration'
      itemId: string
      status: string
      revisedPrompt?: string | null
      result: string
      savedPath?: string | null
      failure?: unknown
    })
  | (AgentEventBase & {
      type: 'error'
      message: string
      willRetry: boolean
      /** true = 与 codex 的连接断了（子进程崩溃/被杀），不是普通回合错误。 */
      connectionLost?: boolean
    })
  | (AgentEventBase & { type: 'warning'; message: string })
  | (AgentEventBase & { type: 'unhandled'; method: string; params: unknown })