import { create } from 'zustand'
import { connectionSlice } from './slices/connection'
import { threadsSlice } from './slices/threads'
import { turnsSlice } from './slices/turns'

import type { TokenUsage, TurnState } from './turnState'
import type { AgentEvent, ConnectionState, Goal } from '../bridge/types'
import type { SettingsData, ThreadSummary } from '../bridge/client'

export interface ShellState {
  connection: ConnectionState
  userAgent: string
  /**
   * 当前工作区路径（= 会话的 cwd）。空串表示**还没打开工作区**——
   * 这时不能建会话、不能发消息，界面引导用户先选文件夹，而不是偷偷
   * 用主目录顶上（会话会散落在各处、用户自己都找不到）。
   */
  cwd: string
  modelId: string
  /** 上下文窗口上限，来自模型目录；拿不到时占位条不显示。 */
  contextWindow: number
  hint: string | null

  // ---- 回合（消息流）----
  turn: import('./turnState').TurnState
  currentTurnId: string | null
  turnStatus: string | null
  turnStartedAt: number | null
  elapsedMs: number | null
/** 当前回合的累计用量。turn.usage 的浅拷贝，给状态栏用。 */
  tokens: TokenUsage
  /** 当前会话的目标（07 号板块）。每会话，切会话时重拉。 */
  goal: Goal | null
  /**
   * 非当前线程的消息流快照（09 号板块）。
   *
   * 一条 `agent-event` 流里混着所有线程的事件；不带分流的话，子代理的
   * 思考与正文会插进主会话。协议自带 `threadId`，所以这里零新命令。
   */
  snapshots: Map<string, TurnState>
  /** 快照的最近活跃时刻，用于淘汰（见 store/snapshots.ts）。 */
  snapshotClock: Map<string, number>

  // ---- 线程 ----
threadList: ThreadSummary[]
  archivedList: ThreadSummary[]
  activeThreadId: string | null
  /** 置顶的会话 id（settings.json 的 `pinnedThreads`，03 号文件）。 */
  pinnedThreads: string[]
  /** 手工排序的会话 id（settings.json 的 `threadOrder`）。 */
  threadOrder: string[]

  // ---- 模型配置（自定义目录，内置目录永不参与）----
  settings: SettingsData | null
  /** 一个自定义模型都没配时为 true：界面引导先打开设置。 */
  needsSetup: boolean
  models: { id: string; displayName: string; isDefault: boolean }[]

  connect: () => Promise<void>
  /**
   * 重连：重新拉起 codex，并把当前会话的历史**按服务端基线校准**。
   *
   * 断线期间的事件永远补不回来，不校准的话消息流与账本呈现的是一段
   * 被截断的历史，而用户会以为那就是全部。
   */
  reconnect: () => Promise<void>
  ingest: (event: AgentEvent) => void
  send: (text: string) => Promise<void>
  setModel: (id: string) => void
  interrupt: () => Promise<void>
  /** 拉当前会话的目标。切会话后要调。 */
  loadGoal: () => Promise<void>
  /**
   * 拉服务端基线**替换**整个回合态。
   *
   * 断线重连后必须调：重连期间的事件永远收不到，只有 `thread/items/list` 才
   * 知道真相。追加会把两边都收到的条目算两遍，所以是替换。
   */
  resyncBaseline: () => Promise<void>
  setHint: (hint: string | null) => void
  answerApproval: (requestId: unknown, decision: 'approve' | 'decline') => Promise<void>
  /** 应答 `item/tool/requestUserInput`：题目 id → 答案。 */
  answerUserInput: (requestId: unknown, answers: Record<string, string>) => Promise<void>
  /** 应答 `mcpServer/elicitation/request`：内容原样透传。 */
  answerElicitation: (requestId: unknown, content: unknown) => Promise<void>

  newThread: () => Promise<void>
  resumeThread: (id: string) => Promise<void>
  archiveThread: (id: string) => Promise<void>
  unarchiveThread: (id: string) => Promise<void>
  deleteThread: (id: string) => Promise<void>
  /** 批量删除：先按结果摘掉两侧列表，再把失败原因交给界面。 */
  deleteThreads: (ids: string[]) => Promise<void>
  renameThread: (id: string, name: string) => Promise<void>
  compactThread: (id: string) => Promise<void>
  clearTurn: () => void
  /** 按当前 cwd 重新拉会话列表。 */
  refreshThreads: () => Promise<void>
  /** 切换工作区：改 cwd + 重列会话 + 丢掉不属于新工作区的当前会话。 */
  setWorkspace: (path: string | null) => Promise<void>
/** 从两侧列表里摘掉已删除的会话，并清掉指向它们的当前态。 */
  forgetThreads: (ids: string[]) => void

  // ------------------------------------------- 会话列表增强（03 号文件）
  /** 置顶 / 取消置顶。置顶不受时间分组影响，钉在列表最上方。 */
  togglePin: (id: string) => void
  /** 拖拽重排：把 `fromId` 会话移到 `toId` 会话的位置。 */
  reorderById: (fromId: string, toId: string) => void
  /** fork 出新会话并切过去（fork 不带历史，紧接着恢复一次）。 */
  fork: (id: string) => Promise<void>
  /** 回滚对话历史到 `beforeTurnId` 之前。**不回滚本地文件改动。** */
  revert: (id: string, beforeTurnId: string) => Promise<void>
  /** 发起压缩。乐观插入进行中态，完成由 `contextCompacted` 事件补上。 */
  compact: () => Promise<void>
  /** 关掉一条压缩常驻提示条（dismissed 记在条目上，跟着消息流走）。 */
  dismissCompactionNotice: (id: string) => void

// ---- 派生 ----
threads: () => ThreadSummary[]
  busy: () => boolean
  pendingApprovals: () => number
  /** 未作答的提问数。有则输入区禁用。 */
  pendingQuestions: () => number
  modelOptions: () => { id: string; displayName: string; isDefault: boolean }[]
}

/**
 * 唯一的后端状态入口。
 *
 * 实现拆成三个分片（连接 / 线程 / 回合），对外仍是一个 store：
 * 组件到处都在用 `useShell`，拆成三个 store 就得在每个组件里订阅三份、
 * 还要自己处理它们之间的一致性。拆的是实现，不是 API。
 */
export const useShell = create<ShellState>()((set, get) => ({
  ...connectionSlice(set, get),
  ...threadsSlice(set, get),
  ...turnsSlice(set, get),
}))

export type { TokenUsage } from './turnState'