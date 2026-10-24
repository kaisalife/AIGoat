/**
 * 本地域的桥接实现：本地文件 + 用户终端。
 *
 * 文件走 `bridge_fs_*` 而不是协议的 `fs/*` 9 项方法——现有本地实现已经能工作，
 * 双通道只会让"到底谁的路径解析生效"变成长期谜题（docs/17 §2）。
 */

import { call } from './tauriCall'
import type { FsEntry, FsReadResult } from './client'

/** 该域的实现集合。由 `tauri.ts` 展开成同一个 client 对象。 */
export function localApi() {
  return {
    // --------------------------------------------- 文件系统
    fsList(dir: string, includeIgnored = false) {
      return call<FsEntry[]>('bridge_fs_list', { dir, includeIgnored })
    },
    fsRead(path: string) {
      return call<FsReadResult>('bridge_fs_read', { path })
    },
    async fsWrite(path: string, content: string) {
      await call<unknown>('bridge_fs_write', { path, content })
    },
    async fsReveal(path: string) {
      await call<void>('bridge_fs_reveal', { path })
    },

    // --------------------------------------------- 用户终端（10 号文件）
    /**
     * 开一个终端。命令**立即返回**，输出全靠 `terminalEvent`——
     * `command/exec` 的应答要等进程退出才来（docs/10 §2 的坑 1）。
     */
    terminalExec(processId: string, command: string[], cwd?: string, tty?: boolean) {
      return call<{ processId: string; status: string }>('bridge_terminal_exec', {
        processId,
        command,
        cwd,
        tty,
      })
    },
    async terminalWrite(processId: string, data: string) {
      await call<void>('bridge_terminal_write', { processId, data })
    },
    async terminalResize(processId: string, rows: number, cols: number) {
      await call<void>('bridge_terminal_resize', { processId, rows, cols })
    },
    async terminalTerminate(processId: string) {
      await call<void>('bridge_terminal_terminate', { processId })
    },
    terminalList() {
      return call<{ instances: string[] }>('bridge_terminal_list')
    },

    // --------------------------------- Trajectory 账本的历史段（06 号文件）
    // 游标是协议给的不透明字符串，原样回传。
    threadItems(threadId: string, options: ItemPageOptions = {}) {
      return call<{ items: unknown[]; nextCursor: string | null }>('bridge_thread_items', {
        threadId,
        cursor: options.cursor ?? null,
        limit: options.limit ?? null,
        turnId: options.turnId ?? null,
      })
    },
    threadTurns(threadId: string, options: TurnPageOptions = {}) {
      return call<{ turns: unknown[]; nextCursor: string | null }>('bridge_thread_turns', {
        threadId,
        cursor: options.cursor ?? null,
        limit: options.limit ?? null,
      })
    },
  }
}

/** 分页选项。与契约里的 `threadItems(threadId, options?)` 对应。 */
type ItemPageOptions = { cursor?: string | null; limit?: number; turnId?: string }
type TurnPageOptions = { cursor?: string | null; limit?: number }