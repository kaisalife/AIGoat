/**
 * 宿主交互类条目：客户端工具调用、向用户提问、MCP elicitation、函数回传。
 *
 * 从 `entries.ts` 拆出来的理由是**共同点**：这四类的状态都由**宿主这边**
 * 推进（执行器写回、用户填完写回），而不是由 codex 的事件收口。
 * 它们必须应答或等待用户，界面上也不能自动消失——与"事件来了就更新"的
 * 那批条目是两种生命周期。
 */

import type { UserInputQuestion } from '../bridge/types'
import type { Base } from './entryBase'
/**
 * 客户端工具调用（`item/tool/call`）。
 *
 * 宿主正在替 codex 执行一个工具。**必须应答**——不答那一轮会永远挂着。
 * 状态由执行器自己推进，不靠事件收口。
 */
export interface ToolCallEntry extends Base {
  kind: 'toolCall'
  requestId: unknown
  callId: string
  tool: string
  namespace?: string | null
  arguments: unknown
  status: 'running' | 'completed' | 'failed'
  output: string
}

/**
 * 向用户提问（`item/tool/requestUserInput`）。
 *
 * 与审批的区别：审批是「批不批这个操作」，这里是要**内容**。所以它带
 * 题目而不是命令，答案也按题目 id 回去而不是一个 decision 字符串。
 */
export interface UserInputEntry extends Base {
  kind: 'userInput'
  requestId: unknown
  itemId: string
  questions: UserInputQuestion[]
  isBlocking: boolean
  state: 'pending' | 'answered'
  /** 已给的答案（questionId → 文本）。 */
  answers?: Record<string, string>
}

/** MCP 服务器向用户要输入（`mcpServer/elicitation/request`）。 */
export interface ElicitationEntry extends Base {
  kind: 'elicitation'
  requestId: unknown
  serverName?: string | null
  message?: string | null
  requestedSchema?: unknown
  state: 'pending' | 'answered'
  /** 已提交的内容（形状由它自己的 schema 定，原样保留）。 */
  answers?: Record<string, string>
}

/** `functionCallOutput`：宿主函数调用的回传（05 §2）。 */
export interface FunctionOutputEntry extends Base {
  kind: 'functionOutput'
  name: string
  namespace?: string | null
  output: string
}