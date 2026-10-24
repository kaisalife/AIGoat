/**
 * 回合：**收**事件，以及回合态的初始值。
 *
 * 这一块是消息流的唯一入口——所有 `AgentEvent` 都从这里过一遍，
 * 所以它持有 `turn` 状态但不碰渲染。
 *
 * 发出去的请求（发消息 / steer / 应答）在 `outbound.ts`：那边全是低频、
 * 每次都要处理失败的分支，混进来会把下面的事件收口挤到看不见的地方。
 */

import { getClient } from '../../bridge/session'
import type { Goal } from '../../bridge/types'
import { applyEvent } from '../reducer'
import { runClientTool } from '../runClientTool'
import { useResources } from '../resources'
import { useTerminals } from '../terminals'
import { threadOf } from '../snapshots'
import { applyThreadEvent } from './applyThreadEvent'
import { ingestForeign } from './ingestForeign'
import {
  answerApproval,
  answerElicitation,
  answerUserInput,
  sendNow,
} from './outbound'

import { emptyTurnState, type TurnState } from '../turnState'
import { elapsed, type Slice, type TurnsKeys } from './types'
import { compact, dismissCompactionNotice, resyncBaseline } from './turnActions'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const EMPTY_SNAPSHOTS = new Map<string, TurnState>()
const EMPTY_CLOCK = new Map<string, number>()

export const turnsSlice: Slice<TurnsKeys> = (set, get) => {
  return {
  turn: emptyTurnState(),
  currentTurnId: null,
  turnStatus: null,
  turnStartedAt: null,
  elapsedMs: null,
  tokens: { total: 0, input: 0, cached: 0, output: 0, reasoning: 0 },
  goal: null,
  // 09 号板块：非当前线程的快照。使用共享空 Map 避免 store 初始化时创建新引用。
  snapshots: EMPTY_SNAPSHOTS,
  snapshotClock: EMPTY_CLOCK,

  busy: () => get().turnStatus === 'inProgress',

  pendingApprovals: () =>
    get().turn.entries.filter((e) => e.kind === 'approval' && e.state === 'pending').length,

pendingQuestions: () =>
    get().turn.entries.filter(
      (e) => (e.kind === 'userInput' || e.kind === 'elicitation') && e.state === 'pending',
    ).length,

  /**
   * 拉当前会话的目标（07 号板块）。
   *
   * 目标是**每会话**的，所以切会话必须重拉——沿用上一会话的目标会让用户
   * 以为模型在追一个它已经不该追的东西。
   */
  async loadGoal() {
    const threadId = get().activeThreadId
    if (!threadId) return set({ goal: null })
    try {
      set({ goal: await getClient().goalGet(threadId) })
    } catch {
      // 拉不到就当作没有目标：目标条是增强功能，不该因为它读不到就报错。
      set({ goal: null })
    }
  },

  ingest(event) {
      const s = get()

      // 【09 号板块】按 threadId 分流。一条 agent-event 流里混着所有线程的
      // 事件（子代理在自己的线程里跑），改造前一律灌进唯一的 turn ——
      // 于是子代理的思考与正文会插进主会话。协议自带 threadId，所以零新命令。
      const owner = threadOf(event)
      if (owner && owner !== s.activeThreadId) {
        ingestForeign(set, get, event, owner)
        return
      }

      // 所有事件先过消息组装器，界面才有东西可渲染。
      const turn = applyEvent(s.turn, event)

    switch (event.type) {
      case 'turnStarted':
        set({
          currentTurnId: event.turnId,
          turnStatus: 'inProgress',
          turnStartedAt: Date.now(),
          elapsedMs: null,
        })
        break
      case 'turnComplete':
        set({ turnStatus: event.status, elapsedMs: elapsed(s.turnStartedAt) })
        break
      case 'threadEvent':
        // applyThreadEvent 自己负责列表与当前态（归档/删除当前会话时会把
        // turn 清空）。这里**必须 return**：落到末尾 `set({ turn })` 会把
        // 基于关闭前状态算出的旧 turn 又写回去，刚清掉的会话就挂回界面了。
        applyThreadEvent(set, get, event)
        return
      case 'error':
        // 连接断了（codex 子进程崩溃/被杀）：把连接态切成 error，状态栏才会
        // 给出「重新连接」；重连会按存活校验重新 spawn codex 并校准历史。
        set(
          event.connectionLost
            ? { hint: event.message, connection: 'error' }
            : { hint: event.message },
        )
        break
      case 'warning':
        set({ hint: event.message })
        break
case 'toolCallRequested':
        // 必须应答的请求：不接执行器这一轮就永远挂着。见 clientTools.ts。
        set({ turn })
        void runClientTool(set, get, event)
        return
      case 'terminalEvent':
        // 终端事件走自己的 store：输出是高频的，混进消息流会让整条消息流
        // 跟着每帧重渲染（见 store/terminals.ts 的说明）。
        useTerminals.getState().ingest(event)
        return
      case 'hostEvent':
      case 'guardEvent': {
        // 16 号板块 §3：resources 改事件驱动。C 期已把真源映射成这两种事件，
        // 这里只做转发——右栏自己决定刷哪一块（REFRESH_PLAN）。
        const payload = event['event']
        const kind = isRecord(payload) ? String(payload['kind'] ?? '') : ''
        useResources.getState().ingestHostEvent(kind)
        return
      }
      case 'goalEvent':
        // 目标整体透传：上游加字段时前端不用改桥接层（07 号板块）。
        // cleared 时 goal 是 null，正好等于"目标没了"。
        set({ goal: (event.goal as Goal | null) ?? null })
        return
      default:
        break
    }

    // 用量只在 reducer 里存一份（turn.usage），这里同步给状态栏，
    // 不再单独维护一份累加——两份数据迟早会对不上。
    set({ turn, tokens: turn.usage })
  },

  /**
   * 发送。回合运行中自动走 steer（追加指令到当前回合），否则开新回合——
   * 分流在 `outbound.sendNow` 里，界面不需要知道自己落在哪条路上。
   */
  send: (text) => sendNow(set, get, text),

  async interrupt() {
    const s = get()
    if (!s.activeThreadId || !s.currentTurnId) return
    await getClient().interrupt(s.activeThreadId, s.currentTurnId)
  },

  answerApproval: (requestId, decision) => answerApproval(set, get, requestId, decision),

  answerUserInput: (requestId, answers) => answerUserInput(set, get, requestId, answers),

  answerElicitation: (requestId, content) => answerElicitation(set, get, requestId, content),

  compact: () => compact(set, get),
  dismissCompactionNotice: (id: string) => dismissCompactionNotice(set, get, id),
  resyncBaseline: () => resyncBaseline(set, get),
  }
}