/**
 * 前后端唯一的接缝。
 *
 * 组件只依赖这个接口，底层是 Tauri 命令层（壳内 spawn codex app-server）。
 *
 * 拆分：`contract.ts` 放载荷类型、`api.ts` 放扩展域的方法声明、本文件只做
 * 组合。改终端方法不必翻过设置中心的类型定义。
 */

import type { AgentEvent, ConnectInfo, Thread, ThreadSummary, UserInput } from './types'
import type {
  BatchDeleteResult,
  McpServerSummary,
  PermissionProfile,
  ReviewTarget,
  SandboxReadiness,
  SendOutcome,
  SettingsData,
  SettingsPayload,
  ThreadFilter,
  ThreadWithHistory,
  UiPrefs,
  UiStateRecord,
  Unsubscribe,
} from './contract'
import type { AttachmentApi, GoalApi, ReviewVerdictApi, ThreadListApi } from './api'

export type * from './contract'
export type * from './api'
export type { RevertOutcome } from './api'

export interface BridgeClient extends GoalApi, AttachmentApi, ThreadListApi, ReviewVerdictApi {
  // ---------------------------------------------------- 连接与事件
  connect(): Promise<ConnectInfo>
  subscribe(handler: (event: AgentEvent) => void): Unsubscribe

  // ---------------------------------------------------- 会话与线程
  listThreads(filter?: ThreadFilter): Promise<ThreadSummary[]>
  startThread(cwd: string, config?: unknown): Promise<Thread>
  resumeThread(threadId: string): Promise<ThreadWithHistory>
  forkThread(threadId: string): Promise<Thread>
  archiveThread(threadId: string): Promise<void>
  unarchiveThread(threadId: string): Promise<void>
  deleteThread(threadId: string): Promise<void>
  batchDeleteThreads(ids: string[]): Promise<BatchDeleteResult>
  renameThread(threadId: string, name: string): Promise<void>
  compactThread(threadId: string): Promise<void>

  // ------------------------------------------------------------ 回合
  /**
   * 发消息。`input` 原样透传给协议——它是 `UserInput[]`（`text` /
   * `localImage` / `skill` / `mention`），不是纯文本。壳不解析它。
   *
   * `clientMessageId` 对应协议的 `turn/start.clientUserMessageId`：带上它，
   * 服务端才知道这条消息对应上哪一条本地回显。
   *
   * `approvalPolicy` 是**逐回合覆盖**（17 号文件 §5.5）：权限档位在这一层
   * 生效，不用重启连接也不用动 settings.json。算不出策略就**省略**——
   * 发 null 会被当成「清空」，那与「用协议默认」不是一回事。
   */
  sendMessage(
    threadId: string,
    input: UserInput[],
    clientMessageId?: string,
    approvalPolicy?: unknown,
    sandboxPolicy?: unknown,
  ): Promise<SendOutcome>

  interrupt(threadId: string, turnId: string): Promise<void>
  /**
   * 运行中追加指令。
   *
   * 协议的 `expectedTurnId` 是**前置条件**：回合已经结束就会拒绝。这是有意
   * 的——它把「追加到已经结束的回合」这种竞态挡在服务端，不用前端去猜当前
   * 回合还算不算数。
   *
   * `clientMessageId` 让 steer 后的正式 `userMessage` 能认领本地回显。
   */
  steer(
    threadId: string,
    turnId: string,
    input: UserInput[],
    clientMessageId?: string,
  ): Promise<string>

  // ------------------------------------------- server → client 请求的应答
  // 这一组**必须**有对应实现：不回应的请求会让 codex 那轮永远挂着。
  /** 审批。`decision` 对应 `ApprovalDecision`。 */
  respondApproval(requestId: unknown, decision: string): Promise<void>
  /** 客户端工具执行结果。 */
  respondToolCall(requestId: unknown, contentItems: unknown[], success: boolean): Promise<void>
  /** 拒绝未实现的宿主能力请求。 */
  respondError(requestId: unknown, message: string): Promise<void>
  /**
   * 应答 `item/tool/requestUserInput`：题目 id → 用户答案。
   *
   * 形状与审批**完全不同**（`{answers}` vs `{decision}`）。混用会被
   * codex 当成非法应答丢掉：用户点了没反应，而且那一轮永远挂着。
   */
  respondUserInput(requestId: unknown, answers: Record<string, string>): Promise<void>
  /** 应答 `mcpServer/elicitation/request`。内容原样透传：形状由它自己定。 */
  respondElicitation(requestId: unknown, content: unknown): Promise<void>

  // ------------------------------------------------- 复核 / 权限 / 沙箱
  review(threadId: string, target: ReviewTarget): Promise<{ reviewThreadId: string }>
  permissionProfiles(cwd?: string): Promise<PermissionProfile[]>
  sandboxReadiness(): Promise<SandboxReadiness>

  // ------------------------------------------------- 右栏资源数据源
  mcpServers(): Promise<McpServerSummary[]>
  skills(cwd: string): Promise<{ name: string; description: string }[]>
  mcpDefinitions(): Promise<import('./contract').McpDefinitionRow[]>
  mcpDefinitionWrite(id: string, definition: Record<string, unknown>): Promise<void>
  mcpDefinitionRemove(id: string): Promise<void>
  skillsConfigWrite(name: string, enabled: boolean): Promise<void>
  skillsConfigRead(): Promise<unknown>
  skillsRootsSet(roots: string[]): Promise<void>
  hooks(
    cwd: string,
  ): Promise<{ key: string; eventName: string; handlerType: string; enabled: boolean }[]>
  config(cwd?: string): Promise<{ key: string; value: null }[]>

  // ---------------------------------------------------- 子 Agent（AF 规范）
  listSubAgents(): Promise<import('./contract').SubAgentRow[]>
  registerSubAgent(spec: import('./contract').SubAgentSpec): Promise<void>
  removeSubAgent(name: string): Promise<void>
  updateSubAgent(spec: import('./contract').SubAgentSpec): Promise<void>
  subAgentInstructions(): Promise<string | null>
  /** 团队清单（名 + 工作流 + 成员）。 */
  listTeams(): Promise<import('./contract').TeamRow[]>
  /** 设置某团队的工作流 / SOP（空串清除）。 */
  setTeamWorkflow(team: string, workflow: string): Promise<import('./contract').TeamRow[]>
  /** 设置某团队的规范（空串清除）。 */
  setTeamSpec(team: string, spec: string): Promise<import('./contract').TeamRow[]>
  /** 按团队编制（花名册）生成副本，原初成员不动。 */
  materializeTeam(
    team: string,
    prune?: boolean,
    members?: string[] | null,
  ): Promise<{ team: string; roster: string[]; created: string[]; pruned: string[] }>

  // ------------------------------------------------------------ 工作区
  listWorkspaces(): Promise<import('./contract').WorkspacesPayload>
  pickWorkspace(): Promise<import('./contract').WorkspacePick>
  activateWorkspace(path: string): Promise<import('./contract').WorkspacesPayload>
  removeWorkspace(
    path: string,
    deleteSessions: boolean,
  ): Promise<import('./contract').WorkspaceRemoved>
  revealWorkspace(path: string): Promise<void>

  // ---------------------------------------------------------- 本地文件
  fsList(dir: string, includeIgnored?: boolean): Promise<import('./contract').FsEntry[]>
  fsRead(path: string): Promise<import('./contract').FsReadResult>
  fsWrite(path: string, content: string): Promise<void>
  fsReveal(path: string): Promise<void>

  // ------------------------------------------- 用户终端（10 号文件）
  /**
   * 开一个终端进程。**立即返回**，不等进程结束。
   *
   * `processId` 必须由前端指定：协议的 `write`/`resize`/`terminate` 都按它
   * 关联，而服务端在缺省时用的内部 id 不暴露给客户端（见 docs/17 §5.6）。
   */
  terminalExec(
    processId: string,
    command: string[],
    cwd?: string,
    tty?: boolean,
  ): Promise<{ processId: string; status: string }>
  terminalWrite(processId: string, data: string): Promise<void>
  terminalResize(processId: string, rows: number, cols: number): Promise<void>
  terminalTerminate(processId: string): Promise<void>
  /** codex 那边还活着的终端 id（重载后用来重挂显示）。 */
  terminalList(): Promise<{ instances: string[] }>

  // ------------------------------ Trajectory 账本的历史段（06 号文件）
  /**
   * 拉一个线程的历史条目，补账本被 ring buffer 丢掉的那一段。
   *
   * `cursor` 是**协议给的不透明游标**，原样回传即可，不要自己拼——那是最容易
   * 在上游改分页方式时静默坏掉的地方。
   */
  threadItems(
    threadId: string,
    options?: { cursor?: string | null; limit?: number; turnId?: string },
  ): Promise<{ items: unknown[]; nextCursor: string | null }>
  /** 拉回合列表（时序总览的回合块）。 */
  threadTurns(
    threadId: string,
    options?: { cursor?: string | null; limit?: number },
  ): Promise<{ turns: unknown[]; nextCursor: string | null }>

  // ------------------------------------------------------- 自定义模型配置
  getSettings(): Promise<SettingsPayload>
  applySettings(settings: SettingsData): Promise<ConnectInfo>
  setActiveModel(modelId: string): Promise<void>
  revealSettingsFile(): Promise<void>
  /** 只写通用偏好，**不重启** codex——切主题不该打断正在跑的会话。 */
  setUiPrefs(prefs: UiPrefs): Promise<void>

  // ------------------------------------- ui-state.json（本地，不用 localStorage）
  /**
   * 读界面状态。**不用 localStorage**：WebView 的存储落 C 盘 AppData，
   * 与「配置跟着安装目录走」的原则冲突，用户也没法直接编辑备份。
   */
  loadUiState(): Promise<UiStateRecord>
  /** 整文件覆盖写。前端 500ms 防抖后调。 */
  saveUiState(state: UiStateRecord): Promise<void>
  /** 清掉 dock 段里已删会话的残留布局。 */
  pruneDock(keepThreadIds: string[]): Promise<void>
  revealUiStateFile(): Promise<void>
}