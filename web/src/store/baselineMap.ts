/**
 * `thread/items/list` 的 item → 消息流条目（重连基线用，16 号板块）。
 *
 * 与 Rust 侧 `map/history.rs` 是**同一套映射**：一边服务 resume 回放，
 * 一边服务重连基线。形状不一样（那边是 `item` 内嵌、这边有 `turnId` 外层），
 * 但产出的条目必须一致——否则"刚打开会话"和"重连之后"看到的历史长得不一样。
 */

import type { FileChange, ToolStatus } from '../bridge/types'
import type { Entry } from './entries'

/** 单个 item → 条目。返回 null 表示这一类我们不渲染（对齐 `map_history`）。 */
export function mapItem(
  item: Record<string, unknown>,
  id: string,
  at: number,
  turn: number,
): Entry | null {
  const type = String(item['type'] ?? '')
  const base = { id, at, turn }
  switch (type) {
    case 'userMessage':
      return { ...base, kind: 'user', text: flattenContent(item['content']) }
    case 'agentMessage':
      return { ...base, kind: 'assistant', text: String(item['text'] ?? ''), streaming: false }
    case 'reasoning':
      return {
        ...base,
        kind: 'reasoning',
        text: joinParts(item['summary'], item['content']),
        streaming: false,
      }
    case 'commandExecution':
      return {
        ...base,
        kind: 'tool',
        itemId: id,
        toolKind: 'command',
        name: String(item['command'] ?? ''),
        output: String(item['aggregatedOutput'] ?? ''),
        status: normalizeStatus(item['status']),
        exitCode: numberOrNull(item['exitCode']),
        durationMs: numberOrNull(item['durationMs']),
        streaming: false,
      }
    case 'mcpToolCall':
      return {
        ...base,
        kind: 'tool',
        itemId: id,
        toolKind: 'mcp',
        name: String(item['tool'] ?? ''),
        output: stringify(item['result'] ?? item['error'] ?? ''),
        status: normalizeStatus(item['status']),
        durationMs: numberOrNull(item['durationMs']),
        streaming: false,
      }
    case 'dynamicToolCall':
      return {
        ...base,
        kind: 'tool',
        itemId: id,
        toolKind: 'dynamicTool',
        name: String(item['tool'] ?? ''),
        output: stringify(item['contentItems'] ?? ''),
        status: normalizeStatus(item['status']),
        durationMs: numberOrNull(item['durationMs']),
        streaming: false,
      }
    case 'collabAgentToolCall':
      return {
        ...base,
        kind: 'tool',
        itemId: id,
        toolKind: 'collabAgent',
        name: String(item['tool'] ?? ''),
        output: '',
        status: normalizeStatus(item['status']),
        streaming: false,
      }
    case 'webSearch':
      return {
        ...base,
        kind: 'tool',
        itemId: id,
        toolKind: 'webSearch',
        name: 'webSearch',
        output: '',
        status: 'completed',
        streaming: false,
      }
    case 'fileChange':
      return {
        ...base,
        kind: 'fileEdit',
        itemId: id,
        changes: normalizeChanges(item['changes']),
        status: String(item['status'] ?? 'completed'),
      }
    case 'imageView':
      return { ...base, kind: 'imageView', path: String(item['path'] ?? '') }
    case 'imageGeneration':
      return {
        ...base,
        kind: 'imageGeneration',
        status: String(item['status'] ?? 'completed'),
        revisedPrompt: stringOrNull(item['revisedPrompt']),
        result: stringOrNull(item['result']),
        savedPath: stringOrNull(item['savedPath']),
        failure: item['failure'] ?? null,
      }
    case 'plan':
      // 计划正文走 PlanDocTab，不进消息流——否则每轮计划变更都会往流里插一条。
      return null
    case 'contextCompaction':
      return { ...base, kind: 'compaction', running: false, byUser: false, summarizedCount: null }
    case 'subAgentActivity':
      return {
        ...base,
        kind: 'subAgent',
        agentThreadId: String(item['agentThreadId'] ?? ''),
        agentPath: String(item['agentPath'] ?? ''),
        activity: String(item['kind'] ?? ''),
      }
    case 'enteredReviewMode':
    case 'exitedReviewMode':
      return {
        ...base,
        kind: 'reviewMode',
        mode: type === 'enteredReviewMode' ? 'entered' : 'exited',
        review: String(item['review'] ?? ''),
      }
    case 'sleep':
      return {
        ...base,
        kind: 'notice',
        level: 'info',
        text: `Agent 主动等待 ${Math.round(Number(item['durationMs'] ?? 0) / 1000)}s`,
      }
    default:
      return null
  }
}

/**
 * `reasoning.summary` 是分段数组，正文在 `content`。两段都拼上。
 *
 * `content` **按字符串或字符串数组都认**：与 Rust `map/history.rs` 的
 * `reasoning_text` 保持一致。原先这里只认数组、那边只认字符串，于是
 * 「切会话回放」与「重连基线」必有一边丢掉推理正文。两边都放宽，消除分歧。
 */
function joinParts(summary: unknown, content: unknown): string {
  const parts: string[] = []
  if (Array.isArray(summary)) {
    for (const x of summary) if (typeof x === 'string') parts.push(x)
  }
  if (typeof content === 'string') parts.push(content)
  else if (Array.isArray(content)) {
    for (const x of content) if (typeof x === 'string') parts.push(x)
  }
  return parts.filter(Boolean).join('\n')
}

function flattenContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object') {
        const text = (part as Record<string, unknown>)['text']
        return typeof text === 'string' ? text : ''
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/** 协议状态 → 我们的 ToolStatus。未知值按 completed 处理（不再运行）。 */
function normalizeStatus(value: unknown): ToolStatus {
  const raw = String(value ?? 'completed')
  return raw === 'inProgress' || raw === 'completed' || raw === 'failed' ? raw : 'completed'
}

/**
 * 协议 `FileUpdateChange` → 我们的 `FileChange`。
 *
 * 协议的 `kind` 是内嵌 tag（`{type:"add"|"delete"|"update"}`），而
 * `FileChange` 只认 `'update'` 一档。所以这里**丢掉 kind**：路径与 diff
 * 才是关键信息，kind 只影响一个图标，不值得为它把联合撑开。
 */
function normalizeChanges(value: unknown): FileChange[] {
  if (!Array.isArray(value)) return []
  return value.map((c) => {
    const change = (c ?? {}) as Record<string, unknown>
    const kindObj = (change['kind'] ?? {}) as Record<string, unknown>
    return {
      kind: 'update' as const,
      path: String(change['path'] ?? ''),
      diff: String(change['diff'] ?? ''),
      movePath: typeof kindObj['move_path'] === 'string' ? kindObj['move_path'] : undefined,
    }
  })
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? ''
  } catch {
    return String(value)
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}