/**
 * 会话恢复：重开应用后回到上次打开的会话。
 *
 * # 为什么会话历史会"丢"
 *
 * codex 自己把每条会话（rollout）持久化在它的数据目录里，所以历史**本身**
 * 从不丢——壳一重连，`thread/list` 就把它们列回来了。丢的是壳的**当前会话
 * 游标**：`activeThreadId` 只活在内存里，关掉即忘。于是重开后的画面是
 * 侧栏列着一堆会话、中栏却空空如也，用户得自己在列表里再找回来。
 *
 * 这里把那枚游标按工作区记进 `ui-state.json`（与布局 / dock 同一份文件、
 * 同一套落盘策略，不用 localStorage），启动时读回来 `resume` 一次，
 * 历史即回放进消息流。
 *
 * 按 cwd 分桶，是因为一个工作区只显示自己的会话：把 A 目录的会话恢复到
 * B 目录会指到一个根本不在列表里的线程。
 */

import { patchUiState, readUiState } from '../components/layout/uiStateChannel'
import { useShell } from './shell'
import { lastThreadFor, withLastThread } from './sessionCursor'

/** 记住当前会话（按 cwd 分桶）。落盘是防抖的，失败不影响当下操作。 */
export async function rememberSession(cwd: string, threadId: string): Promise<void> {
  if (!cwd || !threadId) return
  const state = await readUiState()
  patchUiState({ session: withLastThread(state.session, cwd, threadId) })
}

/**
 * 启动时恢复：把上次的会话 resume 回消息流。
 *
 * 只在"当前没有已打开的会话、工作区已就绪、记下的 threadId 仍在这个工作区
 * 的列表里"时动手——任一不成立就什么都不做，把画面留给现有的空态引导。
 */
export async function restoreLastSession(): Promise<void> {
  const shell = useShell.getState()
  if (shell.activeThreadId || !shell.cwd) return
  const state = await readUiState()
  const threadId = lastThreadFor(
    state.session,
    shell.cwd,
    shell.threadList.map((t) => t.id),
  )
  if (!threadId) return
  await shell.resumeThread(threadId)
}

/**
 * 订阅当前会话变化并落盘。启动时装一次，返回取消订阅函数。
 *
 * 用订阅而不是在各个动作里埋点：建会话、打开、fork、恢复……凡是把
 * `activeThreadId` 指向新会话的地方都该被记住，逐处埋点迟早会漏一处。
 */
export function watchActiveSession(): () => void {
  return useShell.subscribe((state, prev) => {
    if (!state.cwd || !state.activeThreadId) return
    if (state.activeThreadId === prev.activeThreadId && state.cwd === prev.cwd) return
    void rememberSession(state.cwd, state.activeThreadId)
  })
}
