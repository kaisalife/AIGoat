/**
 * 会话游标的纯逻辑（`sessionRestore.ts` 的副作用层只负责读写与 resume）。
 *
 * 单独一个文件是为了能被 vitest 直接测：`sessionRestore.ts` 一 import 就
 * 把桥接层（Tauri）与 store 一起拖进来，在 node 测试环境里跑不起来。
 * 这与 `threadOrder.ts` / `approvalPolicy.ts` 是同一种拆法。
 */

import type { UiStateRecord } from '../bridge/client'

export type SessionState = NonNullable<UiStateRecord['session']>

/**
 * 从记录的会话里挑出**此刻可恢复**的那个。
 *
 * 三件事同时成立才返回 id——记了、属于这个工作区、且仍在该工作区的会话
 * 列表里。否则返回 null（会话可能已被删 / 归档 / 移到别的目录），界面
 * 照常为空，而不是指着一个不存在的会话。
 */
export function lastThreadFor(
  session: SessionState | undefined,
  cwd: string,
  threadIds: readonly string[],
): string | null {
  if (!cwd) return null
  const id = session?.lastThreadByCwd?.[cwd]
  if (!id) return null
  return threadIds.includes(id) ? id : null
}

/** 写回一枚游标后的 session 段（不改原对象）。 */
export function withLastThread(
  session: SessionState | undefined,
  cwd: string,
  threadId: string,
): SessionState {
  const base = session ?? {}
  return { ...base, lastThreadByCwd: { ...(base.lastThreadByCwd ?? {}), [cwd]: threadId } }
}

/**
 * 摘掉指向已删会话的恢复游标。
 *
 * 游标按工作区存，容量有上界（≤ 工作区数），本身不是膨胀源；但删了会话
 * 还留着指向它的死 id 会让 ui-state.json 里出现"恢复一个不存在的会话"的记录。
 * 值命中 `gone` 的条目被删掉；没有变化时返回 null，调用方据此跳过落盘。
 */
export function pruneLastThreads(
  session: SessionState | undefined,
  gone: ReadonlySet<string>,
): SessionState | null {
  const map = session?.lastThreadByCwd
  if (!map) return null
  const kept = Object.entries(map).filter(([, id]) => !gone.has(id))
  if (kept.length === Object.keys(map).length) return null
  return { ...(session ?? {}), lastThreadByCwd: Object.fromEntries(kept) }
}
