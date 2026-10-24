/**
 * 工作区契约类型（`BridgeClient` 的工作区载荷）。
 *
 * 从 `contract.ts` 拆出来的原因：那文件已经 200+ 行，工作区类型是其中最
 * 自洽的一段，单独成文件后两边都更容易维护。
 */

// ------------------------------------------------------------- 工作区

/** 工作区 = 一个文件夹。会话靠 cwd 归属工作区，列表本身不存会话。 */
export interface WorkspaceSummary {
  path: string
  /** 文件夹名，界面上当标题用。 */
  name: string
  lastOpenedAt: number
  active: boolean
}

export interface WorkspacesPayload {
  workspaces: WorkspaceSummary[]
  active: string | null
}

/** 选文件夹的应答：`path` 为 null 表示用户取消，此时列表保持原样。 */
export interface WorkspacePick extends WorkspacesPayload {
  path: string | null
  canceled: boolean
}

/** 删工作区时连带删会话的结果。磁盘上的文件一律不动。 */
export interface WorkspaceRemoved extends WorkspacesPayload {
  deletedSessions: number
  /**
   * 被删会话的 id（成功删除的那些）。前端据此清掉自己在 ui-state.json /
   * settings.json 里为这些会话记下的残留（dock 布局、置顶/顺序、恢复游标）。
   */
  deletedIds: string[]
  failed: { id: string; error: string }[]
}

/** 批量删会话：单个失败不影响其余，两组分别回报。 */
export interface BatchDeleteResult {
  deleted: string[]
  failed: { id: string; error: string }[]
}
