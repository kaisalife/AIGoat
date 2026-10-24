/**
 * 会话被删后清掉**壳自己**写下的残留。
 *
 * codex 那边由 `thread/delete` 负责：它硬删 rollout 文件（含归档的）、
 * 子代理线程、state DB 行、thread-history 行与名字索引（见 codex 0.156.1
 * 的 `thread-store/src/local/delete_thread.rs`）。这里管的是另一份——本应用
 * 在 ui-state.json（`dock.<threadId>` 布局、`session.lastThreadByCwd` 恢复
 * 游标）与 settings.json（置顶/顺序）里按 threadId 记的东西。
 *
 * 不清的后果不是"少一条日志"，而是 ui-state.json 只增不减，而且落盘是整段
 * 覆写：某次 `save` 会把内存里残留的旧条目又写回去，越积越多。所以删除路径
 * 上必须把删除的 id 一并交到这里。
 */

import { patchUiState, readUiState } from '../components/layout/uiStateChannel'
import { useDockStore } from '../components/dock/useDockStore'
import { useLedger } from './ledger'
import { pruneLastThreads } from './sessionCursor'

/**
 * 清掉这些会话的壳内残留：右栏 dock 布局 + 恢复游标 + 内存账本。
 *
 * 置顶/手工顺序不在这里——它们在 settings.json、由 `forgetThreads` 的分片
 * 包装统一 prune 并落盘。
 */
export function forgetDeletedThreads(ids: readonly string[]): void {
  if (ids.length === 0) return
  useDockStore.getState().forget(ids)
  // 账本按 threadId 在内存里留最多 5000 行/线程。会话删了还留着就是纯内存泄漏
  // （`drop` 之前只在重连时调过）。随删除一起清，否则删得越多内存越涨。
  for (const id of ids) useLedger.getState().drop(id)
  void forgetSessions(ids)
}

/** 摘掉指向这些已删会话的恢复游标（按 cwd 存的、值命中就删）。 */
async function forgetSessions(ids: readonly string[]): Promise<void> {
  const state = await readUiState()
  const next = pruneLastThreads(state.session, new Set(ids))
  // null = 没有条目命中，别白写一次盘。
  if (next) patchUiState({ session: next })
}
