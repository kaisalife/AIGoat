/**
 * 工作区（= 一个文件夹）的状态与操作。
 *
 * 会话本身不存这里——codex 的 thread 自带 cwd，按工作区隔离靠 `thread/list`
 * 的 cwd 过滤。这个 store 只管三件事：已打开过哪些文件夹、当前是哪个、
 * 以及切换时把 `shell` 的会话列表跟着刷一遍。
 *
 * 依赖方向是单向的（本 store → shell）。`shell.connect()` 刻意不认识这里，
 * 启动时由 `main.tsx` 调 `bootstrap()` 串起来，避免两个 store 互相 import。
 */

import { create } from 'zustand'
import type { WorkspaceSummary } from '../bridge/client'
import { getClient } from '../bridge/session'
import { useShell } from './shell'
import { useResources } from './resources'

interface WorkspaceState {
  list: WorkspaceSummary[]
  /** 当前工作区路径；null = 还没打开。 */
  active: string | null
  loading: boolean
  /** 删除确认对话框要用的目标。 */
  pendingRemoval: WorkspaceSummary | null

  bootstrap: () => Promise<void>
  refresh: () => Promise<void>
  /** 弹系统文件夹选择框；取消时保持原样。 */
  pick: () => Promise<void>
  activate: (path: string) => Promise<void>
  /** 管理对话框的入口。 */
  openRemove: (ws: WorkspaceSummary) => void
  cancelRemove: () => void
  /** 确认删除。`deleteSessions` 为真时连带删掉该工作区的会话。 */
  confirmRemove: (deleteSessions: boolean) => Promise<void>
  reveal: (path: string) => Promise<void>
}

export const useWorkspaces = create<WorkspaceState>()((set, get) => {
  const client = getClient()

  /** 切换当前工作区，并把依赖 cwd 的东西（会话列表 + 右栏资源）一起刷掉。 */
  const switchTo = async (path: string | null) => {
    const shell = useShell.getState()
    await shell.setWorkspace(path)
    const cwd = useShell.getState().cwd
    // 没有工作区就没有"这个项目的技能/钩子/权限"，硬传空串只会得到一堆报错。
    if (cwd) await useResources.getState().load(cwd)
  }

  const apply = async (payload: {
    workspaces: WorkspaceSummary[]
    active: string | null
  }) => {
    set({ list: payload.workspaces, active: payload.active, loading: false })
  }

  const fail = (what: string, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    set({ loading: false })
    useShell.getState().setHint(`${what}：${message}`)
  }

  return {
    list: [],
    active: null,
    loading: false,
    pendingRemoval: null,

    /** 启动时调：读列表 → 切到当前工作区 → 右栏跟着切。 */
    async bootstrap() {
      set({ loading: true })
      try {
        const payload = await client.listWorkspaces()
        await apply(payload)
        await switchTo(payload.active)
      } catch (err) {
        fail('读取工作区失败', err)
      }
    },

    async refresh() {
      set({ loading: true })
      try {
        await apply(await client.listWorkspaces())
      } catch (err) {
        fail('读取工作区失败', err)
      }
    },

    async pick() {
      set({ loading: true })
      try {
        const result = await client.pickWorkspace()
        if (result.canceled || !result.path) {
          // 用户按了取消：列表原样保留，也不切换。
          set({ loading: false })
          return
        }
        await apply(result)
        await switchTo(result.path)
      } catch (err) {
        fail('打开文件夹失败', err)
      }
    },

    async activate(path) {
      if (path === get().active) return
      set({ loading: true })
      try {
        await apply(await client.activateWorkspace(path))
        await switchTo(path)
      } catch (err) {
        fail('切换工作区失败', err)
      }
    },

    openRemove(ws) {
      set({ pendingRemoval: ws })
    },

    cancelRemove() {
      set({ pendingRemoval: null })
    },

    async confirmRemove(deleteSessions) {
      const target = get().pendingRemoval
      if (!target) return
      set({ loading: true, pendingRemoval: null })
      try {
        const result = await client.removeWorkspace(target.path, deleteSessions)
        await apply(result)
        // 「同时删除全部会话」在 codex 那边由 thread/delete 硬删，但壳在
        // ui-state.json（dock 布局/恢复游标）与 settings.json（置顶/顺序）里
        // 也为这些会话记了条目。后端把删掉的 id 一并回传，这里清掉——否则
        // 每删一个工作区，配置里就留下一批指向不存在会话的死条目。
        if (result.deletedIds.length > 0) {
          useShell.getState().forgetThreads(result.deletedIds)
        }
        useShell.getState().setHint(
          result.failed.length > 0
            ? `已移出工作区，${result.deletedSessions} 个会话删除成功，${result.failed.length} 个失败`
            : deleteSessions
              ? `已移出工作区并删除 ${result.deletedSessions} 个会话（文件夹本身保留）`
              : '已移出工作区（文件夹与会话都保留）',
        )
        // 删掉的正好是当前工作区时，active 已经换了别的，需要跟着切过去。
        if (get().active !== useShell.getState().cwd) await switchTo(get().active)
      } catch (err) {
        fail('删除工作区失败', err)
      }
    },

    async reveal(path) {
      try {
        await client.revealWorkspace(path)
      } catch (err) {
        fail('打开文件夹失败', err)
      }
    },
  }
})
