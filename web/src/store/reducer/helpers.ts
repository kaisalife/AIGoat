/**
 * reducer 的共用小工具。
 *
 * 单独成文件是因为它们被三个 reducer 分片同时用到，而它们本身
 * 没有任何事件语义——放哪都是别人的附属品。
 */

import type { ApprovalEntry, Entry } from '../entries'
import type { TurnState } from '../turnState'

let fallbackSeq = 0

/**
 * 取当前**最新**的一条待审批（没有就 null）。
 *
 * 同时可能有多条审批在等，所以不能再用单个槽位存「当前审批」——槽位会被
 * 后到的覆盖，先答的那条就永远定不了稿。`pendingApproval` 只作为"最新一条"
 * 的便捷引用，真正的判据始终是按 `requestId` 在 `entries` 里找。
 */
export function nextPendingApproval(entries: Entry[]): ApprovalEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e && e.kind === 'approval' && e.state === 'pending') return e
  }
  return null
}

/** 兜底 id：事件没带可用标识时用它，保证 React key 不冲突。 */
export function nextId(prefix: string): string {
  fallbackSeq += 1
  return `${prefix}-${fallbackSeq}`
}

/** 取回指定 kind 的最后一条，便于增量追加。 */
export function lastOf<T extends Entry['kind']>(
  entries: Entry[],
  kind: T,
): Extract<Entry, { kind: T }> | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e && e.kind === kind) return e as Extract<Entry, { kind: T }>
  }
  return undefined
}

/**
 * 按 id 覆盖；找不到就追加。这是「同一 item 多次事件」的收口方式。
 *
 * 手写复制而不是 immer：这里是**最热的路径**（每条 delta 一次），immer 的
 * proxy 机制为此付出的常数远大于一次 `slice()`。改动时别图省事换回 `produce`。
 *
 * 从**后往前**找：流式更新命中的几乎总是最后一条，正序扫描在长会话里每条
 * delta 都要走一遍全表。找不到（= 新增条目）时同样扫全表，但新增只在条目
 * 创建时发生，不是热路径。
 */
export function replace(entries: Entry[], next: Entry): Entry[] {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]?.id === next.id) {
      const copy = entries.slice()
      copy[i] = next
      return copy
    }
  }
  return [...entries, next]
}

/** 追加一条。 */
export function push(state: TurnState, entry: Entry): TurnState {
  return { ...state, entries: [...state.entries, entry] }
}

/**
 * 按 `itemId` 找同 kind 的条目，返回下标与条目本身。
 *
 * # 为什么不直接用 `lastOf`
 *
 * `lastOf` 隐含假设「同类事件严格串行到达」。codex 会**并行**跑多个工具，
 * 于是 A start、B start、A delta、A end 这种交错是常态。此时 `lastOf('tool')`
 * 取到的是 B，A 的 delta / end 全部匹配不上而被丢弃——A 的卡片就永远停在
 * `inProgress` 上转圈。
 *
 * 协议给每个 item 都带 `itemId`，而 `applyToolStart` 建的条目 `id` 就是它，
 * 所以按 id 定位是唯一正确的收口方式。
 *
 * 从**后往前**找：同一个 itemId 理论上只会有一条，但万一有重复（比如
 * 重连后基线重建），保留最后一条更接近"最新状态"。
 */
export function findByItemId<T extends Entry['kind']>(
  entries: Entry[],
  kind: T,
  itemId: string | undefined,
): { index: number; entry: Extract<Entry, { kind: T }> } | undefined {
  if (!itemId) return undefined
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    // `itemId` 不是所有 kind 都有（ToolCallEntry 用 requestId 关联），
    // 所以这里按运行时字段判断，而不是让类型断言替我们保证——断言会把这个
    // 洞藏起来，直到某天真的按 itemId 去查一个没有该字段的条目为止。
    const tag = e as { itemId?: string }
    if (e && e.kind === kind && tag.itemId === itemId) {
      return { index: i, entry: e as Extract<Entry, { kind: T }> }
    }
  }
  return undefined
}

/** 改计划段。 */
export function withPlan(state: TurnState, plan: Partial<TurnState['plan']>): TurnState {
  return { ...state, plan: { ...state.plan, ...plan } }
}

/** `userMessage` 的 content 是结构化片段，界面只要纯文本。 */
export function flattenUserContent(content: unknown[]): string {
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object') {
        const p = part as Record<string, unknown>
        if (typeof p['text'] === 'string') return p['text']
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/** 工具回传的输出可能是字符串或结构化值，统一取可显示文本。 */
export function textOf(output: unknown): string | undefined {
  if (output === undefined || output === null) return undefined
  if (typeof output === 'string') return output
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output)
  }
}

/** 结构化入参的可显示形态：取常见的几个键，否则退回 JSON。 */
export function describeInput(input: unknown): string {
  if (input === undefined || input === null) return ''
  if (typeof input === 'string') return input
  if (typeof input !== 'object') return String(input)
  const p = input as Record<string, unknown>
  for (const key of ['command', 'cmd', 'query', 'path', 'filePath', 'url', 'pattern']) {
    const value = p[key]
    if (typeof value === 'string' && value) return value
  }
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}