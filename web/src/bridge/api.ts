/**
 * 契约的**扩展段**：与 `contract.ts` 的载荷类型不同，这些是纯方法声明。
 *
 * 单独成文件是因为它们分属三块互不相干的业务（目标、附件），而
 * `contract.ts` 已经装满了载荷类型。两个文件都只声明不实现，实现按同样的
 * 划分在 `tauri*.ts` 里——运行时仍然只有一个 client 对象。
 */

import type { Goal } from './types'

/** 目标 Goal（07 号文件）。 */
export interface GoalApi {
  /** 读当前目标。没有目标时返回 null，不是报错。 */
  goalGet(threadId: string): Promise<Goal | null>
  /**
   * 设置目标。**只改传了的字段**——协议的 null 语义是"不动它"而不是"清空"，
   * 想清空得用 `goalClear`（docs/17 §5.3）。
   */
  goalSet(
    threadId: string,
    patch: { objective?: string; status?: string; tokenBudget?: number },
  ): Promise<void>
  goalClear(threadId: string): Promise<void>
}

/**
 * 回滚会话历史的结果（03 号文件）。
 *
 * 两个游标是**向后**补历史的入口：回滚后要把被替换掉的那几轮回填进来，
 * 否则界面上会比服务端少几轮（看着像"回滚把历史吃了"）。
 */
export interface RevertOutcome {
  /** 回滚后线程的元信息（不含 turns——协议明确说它总是空的）。 */
  thread: unknown
  /** 传给 `thread/turns/list`（sortDirection:"desc"）补回合。 */
  turnsBackwardsCursor: string | null
  /** 传给 `thread/items/list`（sortDirection:"desc"）补条目。 */
  itemsBackwardsCursor: string | null
}

/** 附件 Attachment（11 号文件）。 */
export interface AttachmentApi {
  attachmentList(
    threadId: string,
    options?: { cursor?: string | null; limit?: number },
  ): Promise<{ attachments: unknown[]; nextCursor: string | null }>
  /**
   * 登记附件。`payload` 的形状由 `attachmentType` 决定，宿主只透传，
   * 不预读文件也不校验大小（docs/17 §5.1）。
   */
  attachmentAdd(
    threadId: string,
    attachmentType: string,
    identityKey: string,
    payload: unknown,
  ): Promise<void>
  /** 按稳定标识删（type + identityKey），不是按 id。 */
  attachmentRemove(threadId: string, attachmentType: string, identityKey: string): Promise<void>
}

/** 会话列表的排序与状态（03 号文件）。 */
export interface ThreadListApi {
  /**
   * 回滚会话历史。
   *
   * `beforeTurnId` 是**被排除**的那一回——它与之后的每一回都被替换掉。
   * 协议文档措辞很明确：**只改持久化的对话历史，不回滚本地文件改动**。
   */
  threadRevert(threadId: string, beforeTurnId: string): Promise<RevertOutcome>
  /** 落盘置顶与手工顺序（settings.json 的两段）。 */
  saveThreadOrder(pinned: string[], order: string[]): Promise<void>
}

/**
 * 复核裁决（11 号板块，docs/17 §5.7 已核实）。
 *
 * 出口是 `thread/approveGuardianDeniedAction`，而它的参数**不是一段文本**，
 * 是把当初那份 `GuardianAssessmentEvent` **原样回灌**：
 *
 * ```
 * ThreadApproveGuardianDeniedActionParams = { threadId, event: JsonValue }
 * ThreadApproveGuardianDeniedActionResponse = Record<string, never>
 * ```
 *
 * 所以「驳回理由」是**记在评估事件里**的（协议侧存），前端只负责把那份
 * 对象拿回来原样送出 + 带上用户的裁决文字。响应是空对象：调完即定稿。
 */
export interface ReviewVerdictApi {
  /** 批准：把评估事件原样回灌，附 `approved`。 */
  reviewApprove(threadId: string, assessment: unknown): Promise<void>
  /** 驳回：附上驳回理由——它是这次裁决的正式记录，不只是给用户看的。 */
  reviewDeny(threadId: string, assessment: unknown, reason: string): Promise<void>
}