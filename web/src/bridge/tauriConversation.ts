/** 对话域的桥接实现：线程、回合、server 请求应答、复核/权限/沙箱。 */

import { call } from './tauriCall'
import type {
  BatchDeleteResult,
  HistoryEntry,
  PermissionProfile,
  RevertOutcome,
  ReviewTarget,
  SandboxReadiness,
  SendOutcome,
  Thread,
  ThreadFilter,
  ThreadSummary,
  UserInput,
} from './client'

/** 该域的实现集合。由 `tauri.ts` 展开成同一个 client 对象。 */
export function conversationApi() {
  return {
    // ------------------------------------------------------------- 线程
    listThreads(filter?: ThreadFilter) {
      return call<ThreadSummary[]>('bridge_list_threads', {
        cwd: filter?.cwd,
        archived: filter?.archived,
      })
    },
    startThread(cwd: string, config?: unknown) {
      return call<Thread>('bridge_start_thread', { cwd, config })
    },
    async resumeThread(threadId: string) {
      // 壳把 thread/resume 回放的历史压成可直接进消息流的条目。
      const resp = await call<{ thread: Thread; history: HistoryEntry[] }>(
        'bridge_resume_thread',
        { threadId },
      )
      return { ...resp.thread, history: resp.history }
    },
    forkThread(threadId: string) {
      return call<Thread>('bridge_fork_thread', { threadId })
    },
    archiveThread(threadId: string) {
      return call<void>('bridge_archive_thread', { threadId })
    },
    unarchiveThread(threadId: string) {
      return call<void>('bridge_unarchive_thread', { threadId })
    },
    deleteThread(threadId: string) {
      return call<void>('bridge_delete_thread', { threadId })
    },
    batchDeleteThreads(ids: string[]) {
      return call<BatchDeleteResult>('bridge_threads_batch_delete', { ids })
    },
    renameThread(threadId: string, name: string) {
      return call<void>('bridge_rename_thread', { threadId, name })
    },
    compactThread(threadId: string) {
      return call<void>('bridge_compact_thread', { threadId })
    },

    // -------------------------------------- 会话列表增强（03 号文件）
    async threadRevert(threadId: string, beforeTurnId: string) {
      return call<RevertOutcome>('bridge_thread_revert', { threadId, beforeTurnId })
    },
    async saveThreadOrder(pinned: string[], order: string[]) {
      await call<void>('bridge_save_thread_order', { pinned, order })
    },

    // ------------------------------------------------------------- 回合
    /**
     * `input` 原样透传：协议里它是 `UserInput[]`（text / localImage /
     * skill / mention），壳不解析。
     *
     * `approvalPolicy` 只在真算得出策略时才发；算不出就**不发**这个键，
     * 让协议用它自己的默认（on-request）。发 null 会被当成"清空"。
     */
    async sendMessage(
      threadId: string,
      input: UserInput[],
      clientMessageId?: string,
      approvalPolicy?: unknown,
      sandboxPolicy?: unknown,
    ) {
      const params: Record<string, unknown> = {
        threadId,
        input,
        clientUserMessageId: clientMessageId ?? null,
      }
      if (approvalPolicy !== undefined) params['approvalPolicy'] = approvalPolicy
      if (sandboxPolicy !== undefined) params['sandboxPolicy'] = sandboxPolicy
      return call<SendOutcome>('bridge_send_message', params)
    },
    async interrupt(threadId: string, turnId: string) {
      // 这两个参数必须真发出去。壳侧的 `bridge_interrupt` 按它们打断**指定**
      // 回合；只发无参的话壳只能挑"当前那个"——子代理在跑的时候，那就是打断
      // 子代理，而用户点的是主会话。
      await call<boolean>('bridge_interrupt', { threadId, turnId })
    },
    async steer(
      threadId: string,
      turnId: string,
      input: UserInput[],
      clientMessageId?: string,
    ) {
      // `expectedTurnId` 由 Rust 侧透传（它是协议的并发前置条件）。
      // `clientUserMessageId` 同样带：steer 之后 codex 会发正式 userMessage，
      // 前端靠这个 id 把本地回显认领掉，不产生两条。
      const resp = await call<{ turnId: string | null }>('bridge_steer', {
        threadId,
        turnId,
        input,
        clientUserMessageId: clientMessageId ?? null,
      })
      return resp?.turnId ?? turnId
    },

    // ---------------------------------------------- 应答 server 请求
    // 这一组**必须**有对应的应答：不回应的请求会让 codex 那轮永远挂着。
    respondApproval(requestId: unknown, decision: string) {
      return call<void>('bridge_respond_approval', { requestId, decision })
    },
    respondToolCall(requestId: unknown, contentItems: unknown[], success: boolean) {
      return call<void>('bridge_respond_tool_result', { requestId, contentItems, success })
    },
    respondError(requestId: unknown, message: string) {
      return call<void>('bridge_respond_error', { requestId, message })
    },
    respondUserInput(requestId: unknown, answers: Record<string, string>) {
      return call<void>('bridge_respond_user_input', { requestId, answers })
    },
    respondElicitation(requestId: unknown, content: unknown) {
      return call<void>('bridge_respond_elicitation', { requestId, content })
    },

    // ------------------------------------ 复核裁决（docs/17 §5.7）
    // 参数是把当初那份评估事件**原样回灌**——不是一段文本。
    async reviewApprove(threadId: string, assessment: unknown) {
      await call<void>('bridge_review_verdict', {
        threadId,
        assessment,
        approved: true,
      })
    },
    async reviewDeny(threadId: string, assessment: unknown, reason: string) {
      await call<void>('bridge_review_verdict', {
        threadId,
        assessment,
        approved: false,
        reason,
      })
    },

    // ------------------------------------------------- 复核 / 权限 / 沙箱
    review(threadId: string, target: ReviewTarget) {
      return call<{ reviewThreadId: string }>('bridge_review', { threadId, target })
    },
    permissionProfiles(cwd?: string) {
      return call<PermissionProfile[]>('bridge_permission_profiles', { cwd })
    },
    async sandboxReadiness() {
      // 命令直接回三态字符串，这里包成前端统一的形状。
      const status = await call<string>('bridge_sandbox_readiness')
      return { status } as SandboxReadiness
    },
  }
}