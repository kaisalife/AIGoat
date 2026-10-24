/**
 * 摘要文案：`条目 → 一句话`。
 *
 * 单独成文件且不 import 任何 React，是为了它可以单测（05 实施清单第一条）。
 * 摘要是卡片与过程组共用的东西：卡片的标题、过程组的组头，算的是同一件事，
 * 只是粒度不同——所以逻辑只写一份。
 *
 * 文案用中文，且**带上数量**：「读取了 3 个文件」比「读文件」信息量大得多，
 * 用户扫一眼就知道这一步干了什么。
 */

import type { Entry, ToolEntry } from '../../store/entries'

/** 工具类别 → 中文类别名。`other` 是兜底，名字照原样透出。 */
const KIND_LABEL: Record<string, string> = {
  command: '命令',
  mcp: 'MCP',
  webSearch: '联网',
  dynamicTool: '动态工具',
  collabAgent: '子 Agent',
  other: '工具',
}

/** 类别 → 动词。摘要按「动词 + 数量 + 对象」拼。 */
const KIND_VERB: Record<string, string> = {
  command: '执行',
  mcp: '调用',
  webSearch: '检索',
  dynamicTool: '调用',
  collabAgent: '派发',
  other: '调用',
}

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? KIND_LABEL.other ?? '工具'
}

/** 单条工具调用的摘要：「执行 npm run build」。 */
export function toolSummary(entry: ToolEntry): string {
  const verb = KIND_VERB[entry.toolKind] ?? KIND_VERB.other ?? '调用'
  const arg = primaryArg(entry.input)
  return arg ? `${verb} ${arg}` : `${verb} ${entry.name}`
}

/**
 * 从入参里挑出最能代表这次调用的那个值。
 *
 * 依次找「会被人读出来的键」：命令、查询词、文件路径。找不到就退回工具名——
 * 摘要里出现一个 JSON 字符串比只显示工具名更难读。
 */
export function primaryArg(input: unknown): string {
  if (input === undefined || input === null) return ''
  if (typeof input === 'string') return truncate(input, 48)
  if (typeof input !== 'object') return truncate(String(input), 48)
  const p = input as Record<string, unknown>
  for (const key of ['command', 'cmd', 'query', 'path', 'filePath', 'url', 'pattern', 'name']) {
    const value = p[key]
    if (typeof value === 'string' && value.trim()) return truncate(value.trim(), 48)
  }
  return ''
}

/**
 * 文件变更的摘要：「编辑了 2 个文件（+30 −8）」。
 *
 * 每处变更的增删行数**按对象缓存**：`fileEditPatch` 是流式的，每次补丁
 * 都会重建 `changes` 列表并重算整段摘要，未变的 change 引用是稳定的
 * （reducer 复用）——缓存后它们不再被重复 `split('\n')`，每次只算新增的那些。
 */
export function fileEditSummary(changes: { diff: string }[]): string {
  const files = changes.length
  let added = 0
  let removed = 0
  for (const change of changes) {
    const counts = countChange(change)
    added += counts.added
    removed += counts.removed
  }
  const base = `编辑了 ${files} 个文件`
  return added || removed ? `${base}（+${added} −${removed}）` : base
}

const changeCounts = new WeakMap<{ diff: string }, { added: number; removed: number }>()

function countChange(change: { diff: string }): { added: number; removed: number } {
  const cached = changeCounts.get(change)
  if (cached) return cached
  let added = 0
  let removed = 0
  for (const line of change.diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added += 1
    else if (line.startsWith('-') && !line.startsWith('---')) removed += 1
  }
  const counts = { added, removed }
  changeCounts.set(change, counts)
  return counts
}

/**
 * 过程组组头摘要（dsh 的 ProcessGroup）。
 *
 * 按组内出现的类别依次拼，例如「思考并执行了 3 个命令，编辑了 2 个文件」。
 * 顺序按出现先后，不按数量——用户读的是时间线。
 */
export function groupSummary(entries: Entry[], running: boolean): string {
  const counts = new Map<string, number>()
  let files = 0
  let reasoning = 0
  const bump = (label: string) => counts.set(label, (counts.get(label) ?? 0) + 1)

  for (const entry of entries) {
    switch (entry.kind) {
      case 'reasoning':
        reasoning += 1
        break
      case 'fileEdit':
        files += entry.changes.length
        break
      case 'tool':
        bump(toolSummary(entry))
        break
      case 'toolCall':
        // 客户端工具：宿主在替 codex 干活，名字比动词更重要。
        bump(`${entry.namespace ? `${entry.namespace}/` : ''}${entry.tool}`)
        break
      default:
        break
    }
  }

  const parts: string[] = []
  if (reasoning > 0) parts.push(`思考${running ? '中' : ''}`)
  for (const [label, count] of counts) {
    parts.push(count > 1 ? `${label} ×${count}` : label)
  }
  if (files > 0) parts.push(`编辑 ${files} 个文件`)

  if (parts.length === 0) return running ? '处理中' : '处理过程'
  // 组头只有一行，超过 50 字就没法一眼扫完，后面的用省略号收掉。
  const head = parts.join('，')
  return head.length > 50 ? `${head.slice(0, 48)}…` : head
}

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? flat.slice(0, max) + '…' : flat
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'inProgress':
      return '执行中'
    case 'completed':
      return '成功'
    case 'failed':
      return '失败'
    case 'declined':
      return '已拒绝'
    default:
      return '未知'
  }
}