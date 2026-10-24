/** 配置域的桥接实现：自定义模型配置、通用偏好、ui-state.json。 */

import { call } from './tauriCall'
import type { ConnectInfo } from './types'
import type { SettingsData, SettingsPayload, UiPrefs, UiStateRecord } from './client'

/** 附件列表的分页选项。与契约里的 ttachmentList(threadId, options?) 对应。 */
type AttachmentPageOptions = { cursor?: string | null; limit?: number }

/** 该域的实现集合。由 `tauri.ts` 展开成同一个 client 对象。 */
export function configApi() {
  return {
    // ------------------------------------------------- 自定义模型配置
    // 内置目录永不参与：模型目录完全由用户的 settings.json 决定（00 铁律 3）。
    getSettings() {
      return call<SettingsPayload>('bridge_settings_get')
    },
    applySettings(settings: SettingsData) {
      return call<ConnectInfo>('bridge_settings_apply', { settings })
    },
    async setActiveModel(modelId: string) {
      await call<void>('bridge_settings_set_active_model', { modelId })
    },
    async revealSettingsFile() {
      await call<void>('bridge_settings_reveal')
    },
    // 切主题走这条：它不重启 codex，所以不会打断正在跑的会话。
    async setUiPrefs(prefs: UiPrefs) {
      await call<void>('bridge_settings_set_ui', { ui: prefs })
    },

    // ---------------------------------- ui-state.json（本地，不用 localStorage）
    async loadUiState() {
      return (await call<UiStateRecord>('bridge_ui_state_load')) ?? {}
    },
    async saveUiState(state: UiStateRecord) {
      await call<void>('bridge_ui_state_save', { state })
    },
    async pruneDock(keepThreadIds: string[]) {
      await call<void>('bridge_ui_state_prune_dock', { keep: keepThreadIds })
    },
    async revealUiStateFile() {
      await call<void>('bridge_ui_state_reveal')
    },

    // ---------------------------------------------- 目标 Goal（07 号文件）
    // 三个字段都是"给了才改"：协议的 null 语义是"不动它"，不是"清空"。
    async goalGet(threadId: string) {
      return (await call<unknown>('bridge_goal_get', { threadId })) ?? null
    },
    async goalSet(
      threadId: string,
      patch: { objective?: string; status?: string; tokenBudget?: number },
    ) {
      await call<void>('bridge_goal_set', {
        threadId,
        objective: patch.objective ?? null,
        status: patch.status ?? null,
        tokenBudget: patch.tokenBudget ?? null,
      })
    },
    async goalClear(threadId: string) {
      await call<void>('bridge_goal_clear', { threadId })
    },

    // ------------------------------------------- 附件 Attachment（11 号文件）
    async attachmentList(threadId: string, options: AttachmentPageOptions) {
      return call<{ attachments: unknown[]; nextCursor: string | null }>('bridge_attachment_list', {
        threadId,
        cursor: options.cursor ?? null,
        limit: options.limit ?? null,
      })
    },
    async attachmentAdd(
      threadId: string,
      attachmentType: string,
      identityKey: string,
      payload: unknown,
    ) {
      await call<void>('bridge_attachment_add', {
        threadId,
        attachmentType,
        identityKey,
        payload,
      })
    },
    async attachmentRemove(threadId: string, attachmentType: string, identityKey: string) {
      await call<void>('bridge_attachment_remove', {
        threadId,
        attachmentType,
        identityKey,
      })
    },
  }
}