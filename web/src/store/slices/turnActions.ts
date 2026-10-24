/**
 * 回合态的动作：压缩、关提示条、换基线。
 *
 * 与 `turns.ts` 分开是因为这三个都是**低频且有副作用**的动作，而 `ingest`
 * 是每条事件都要走的高频路径。放一起会让最要紧的那段被三个冷门分支挤到
 * 下面去。
 */

import { getClient } from '../../bridge/session'
import { baselineFromItems, type ItemEntry } from '../baseline'
import { useLedger } from '../ledger'
import { compactingEntry } from '../reducer/notice'
import { push } from '../reducer/helpers'
import { useSettingsStore } from '../../components/settings/useSettingsStore'
import { approvalPolicyFor, sandboxPolicyFor } from '../approvalPolicy'
import { describe, type GetShell, type SetShell } from './types'

function isItemEntry(value: unknown): value is ItemEntry {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.turnId === 'string' && typeof record.item === 'object' && record.item !== null
}

/**
 * 发起压缩：插一条进行中的卡，完成由 `contextCompacted` 事件补上。
 *
 * 乐观插入进行中态：压缩要跑一会儿，没有立刻反馈的话用户会以为
 * `/compact` 敲下去没反应，接着再敲一次。
 */
export async function compact(set: SetShell, get: GetShell): Promise<void> {
  const threadId = get().activeThreadId
  if (!threadId) {
    set({ hint: '还没有会话，无法压缩。' })
    return
  }
  set({ turn: push(get().turn, compactingEntry(Date.now(), get().turn.turn)) })
  try {
    await getClient().compactThread(threadId)
  } catch (err) {
    // 失败就把那条进行中的卡撤掉——留着一条永远转圈的卡比没有更糟。
    set({
      turn: {
        ...get().turn,
        entries: get().turn.entries.filter((e) => !(e.kind === 'compaction' && e.running)),
      },
      hint: `压缩失败：${describe(err)}`,
    })
  }
}

/** 关掉一条压缩常驻提示条。dismissed 记在条目上，跟着消息流走。 */
export function dismissCompactionNotice(set: SetShell, get: GetShell, id: string): void {
  set({
    turn: {
      ...get().turn,
      entries: get().turn.entries.map((e) =>
        e.kind === 'compactionNotice' && e.id === id ? { ...e, dismissed: true } : e,
      ),
    },
  })
}

/**
 * 拉当前会话的基线并**替换**整个回合态（16 号板块 §3「重连基线替换」）。
 *
 * 为什么是替换而不是追加：重连期间的事件我们**永远收不到**，只有服务端的
 * `thread/items/list` 知道真相。追加会把两边都收到的条目算两遍。
 *
 * 幂等：同样的基线跑两次结果相同，所以可以安全地反复调。
 */
export async function resyncBaseline(set: SetShell, get: GetShell): Promise<void> {
  const threadId = get().activeThreadId
  if (!threadId) return
  try {
    const { items } = await getClient().threadItems(threadId, { limit: 500 })
    // 倒序拉（协议默认），baselineFromItems 内部会翻回升序。
    const validItems = items.filter(isItemEntry)
    if (validItems.length === 0) {
      set({ hint: '重新同步历史失败：服务端返回了空列表。' })
      return
    }
    const baseline = baselineFromItems(validItems, get().turn.turnId)
    // 换掉回合态的同时清掉账本：它里面那些"重连期间收到"的行会和基线重复。
    useLedger.getState().drop(threadId)
    set({ turn: baseline })
  } catch (err) {
    set({ hint: `重新同步历史失败：${describe(err)}` })
  }
}

/**
 * 权限档位 → `approvalPolicy`（17 号 §5.5 的词汇鸿沟，靠 `approvalPolicy.ts`
 * 的表跨过去）。
 *
 * 算不出策略就传 undefined：Rust 侧据此**不发**这个键，用协议默认。
 */
export function policyForSend(): unknown {
  return approvalPolicyFor(useSettingsStore.getState().defaultPermissionProfile) ?? undefined
}

/**
 * 权限档位 → `sandboxPolicy`（与 {@link policyForSend} 成对使用）。
 *
 * 审批策略回答「何时问人」，沙箱策略回答「命令在哪跑」——**只发前者时
 * 沙箱落在 codex 的默认配置上**（通常是 read-only），「沙箱内自动跑」的
 * 档位就会退化成每条命令都要审批。两张表同进同出，缺一不可。
 */
export function sandboxForSend(): unknown {
  return sandboxPolicyFor(useSettingsStore.getState().defaultPermissionProfile) ?? undefined
}