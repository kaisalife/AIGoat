/**
 * 重载后把终端挂回显示（10 号文件 §4.1）。
 *
 * Tauri 的网页重载（dev 热重载 / 用户刷新）会丢掉前端状态，但进程是
 * codex 侧的子进程、**不会死**。所以重载后前端靠 Rust 侧的清单把终端
 * 重新挂回显示。
 *
 * 挂回来的终端**没有输出可补**——输出走事件流，那时已经断了。所以重挂
 * 出来的是一个空的、标着「已重连」的会话：至少用户知道那个进程还在、
 * 还能往里打字，而不是以为终端凭空消失了。
 */

import { getClient } from '../bridge/session'
import { useTerminals } from './terminals'

/** 问 codex 那边还活着哪些终端。读不到就当没有——那是 Rust 侧的问题。 */
async function listLive(): Promise<string[]> {
  try {
    const res = await getClient().terminalList()
    return res.instances
  } catch {
    return []
  }
}

/** 重建这些终端的显示条目，并标成「已重连」。 */
export async function reattachOrphans(): Promise<void> {
  const live = await listLive()
  if (live.length === 0) return
  useTerminals.setState((s) => {
    const known = new Set(s.instances.map((t) => t.id))
    const orphans = live
      .filter((id) => !known.has(id))
      .map((id) => ({
        id,
        title: '（已重连）',
        command: '（重载前的会话）',
        cwd: '',
        status: 'running' as const,
        output: '',
        // 输出已丢，但仍可继续往里打字——进程活着。
        ended: false,
        reattached: true,
      }))
    return { instances: [...s.instances, ...orphans] }
  })
}