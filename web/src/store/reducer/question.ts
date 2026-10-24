/**
 * 提问类事件 → 条目（12 号文件）。
 *
 * 与审批的界线：审批是「批不批这个操作」，这里是要**内容**。所以
 * - 审批共用 `pendingApproval` 一个槽（同时只能有一个在等）
 * - 提问是 `questions` 数组，同一轮可能同时来好几道题，各占一条
 * - 输入区的禁用条件因此不能只看 `pendingApproval`
 */

import type { AgentEvent } from '../../bridge/types'
import type { ElicitationEntry, UserInputEntry } from '../entries'
import type { TurnState } from '../turnState'
import { push } from './helpers'

export function applyQuestion(
  state: TurnState,
  event: AgentEvent,
  at: number,
): TurnState | null {
  switch (event.type) {
    case 'userInputRequested':
      return requestUserInput(state, event, at)
    case 'elicitationRequested':
      return requestElicitation(state, event, at)
    default:
      return null
  }
}

function requestUserInput(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'userInputRequested' }>,
  at: number,
): TurnState {
  return push(state, {
    id: `uin-${String(event.requestId)}`,
    kind: 'userInput',
    at,
    turn: state.turn,
    requestId: event.requestId,
    itemId: event.itemId,
    questions: event.questions,
    isBlocking: event.isBlocking,
    state: 'pending',
  })
}

/** MCP elicitation：服务器要用户填东西。形状由它自己的 schema 定。 */
function requestElicitation(
  state: TurnState,
  event: Extract<AgentEvent, { type: 'elicitationRequested' }>,
  at: number,
): TurnState {
  return push(state, {
    id: `elicit-${String(event.requestId)}`,
    kind: 'elicitation',
    at,
    turn: state.turn,
    requestId: event.requestId,
    serverName: event.serverName,
    message: event.message,
    requestedSchema: event.requestedSchema,
    state: 'pending',
  })
}

/** 提问已作答：把卡片定稿，顺带记下答案（卡片上要显示"你答了什么"）。 */
export function answerQuestion(
  state: TurnState,
  requestId: unknown,
  answers: Record<string, string>,
): TurnState {
  const target = pendingQuestionOf(state, requestId)
  if (!target) return state
  const index = state.entries.findIndex((e) => e.id === target.id)
  if (index < 0) return state
  const copy = state.entries.slice()
  copy[index] = { ...target, state: 'answered', answers }
  return { ...state, entries: copy }
}

/** 取回一条待答的提问（应答前先确认它还在等）。 */
export function pendingQuestionOf(
  state: TurnState,
  requestId: unknown,
): UserInputEntry | ElicitationEntry | undefined {
  return state.entries.find(
    (e) =>
      (e.kind === 'userInput' || e.kind === 'elicitation') &&
      e.requestId === requestId &&
      e.state === 'pending',
  ) as UserInputEntry | ElicitationEntry | undefined
}

/** 未作答的提问数。输入区据此禁用。 */
export function countPendingQuestions(state: TurnState): number {
  return state.entries.filter(
    (e) => (e.kind === 'userInput' || e.kind === 'elicitation') && e.state === 'pending',
  ).length
}
