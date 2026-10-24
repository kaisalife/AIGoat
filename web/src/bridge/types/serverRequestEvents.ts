/**
 * server→client 请求的事件：全部**必须有应答**。
 *
 * 与通知类事件的区别是硬性的：不回应的请求会让 codex 那一轮永远挂着，
 * 界面上表现为 Agent 一直转圈。所以这一组刻意独立成类型——
 * reducer 里处理它时永远要记得配一个 `bridge_respond_*`。
 */

import type { AgentEventBase } from './events'
import type { ApprovalKind, UserInputQuestion } from './core'
export type ServerRequestEvent =   | (AgentEventBase & {
      type: 'approvalRequested'
      requestId: unknown
      approvalKind: ApprovalKind
      itemId: string
      reason?: string | null
      command?: string | null
      cwd?: string | null
    })
  | (AgentEventBase & {
      type: 'toolCallRequested'
      requestId: unknown
      callId: string
      tool: string
      namespace?: string | null
      arguments: unknown
    })
  // ------------------------------------------------- 向用户提问（12 号文件）
  | (AgentEventBase & {
      type: 'userInputRequested'
      requestId: unknown
      itemId: string
      questions: UserInputQuestion[]
      /** true = 必须等答案；false = 可以先继续，超时后走 autoResolutionMs。 */
      isBlocking: boolean
      autoResolutionMs?: number | null
    })
  | (AgentEventBase & {
      type: 'elicitationRequested'
      requestId: unknown
      serverName?: string | null
      message?: string | null
      /** MCP 服务器要的字段；形状由它定，宿主不猜。 */
      requestedSchema?: unknown
    })
  | (AgentEventBase & {
      type: 'hostCapabilityRequested'
      requestId: unknown
      method: string
      reason?: string | null
    })
