/**
 * 账本行的摘要与取文本小工具。
 *
 * 账本要面对**所有**变体（包括未建模的那些），所以入参按宽松记录处理而不是
 * `AnyEvent` 的联合——联合的索引访问在 `switch` 分支里并不能自动收窄。
 */

/** 一行摘要：工具名 / 文本首句 / 通知方法名，各取最有辨识度的那部分。 */
export function summarize(event: Record<string, unknown>): string {
  const type = String(event['type'] ?? '')
  switch (type) {
    case 'textDelta':
    case 'reasoningDelta':
      return clip(textOf(event['delta']))
    case 'textComplete':
      return clip(textOf(event['text']))
    case 'userMessage':
      return clip(flattenContent(event['content']))
    case 'toolCallStart':
    case 'toolCallEnd':
    case 'toolCallRequested':
      return `${textOf(event['name']) || textOf(event['tool'])}${argHint(event['input'])}`
    case 'toolCallDelta':
      return clip(textOf(event['delta']))
    case 'functionCallOutput':
      return clip(textOf(event['name']))
    case 'fileEdit':
    case 'fileEditPatch':
      return `变更 ${Array.isArray(event['changes']) ? event['changes'].length : 0} 项`
    case 'turnStarted':
      return `turn ${textOf(event['turnId'])}`
    case 'turnComplete':
      return textOf(event['status'])
    case 'tokenUsage':
      return `共 ${textOf(event['totalTokens'])} · 缓存 ${textOf(event['cachedInputTokens'])}`
    case 'approvalRequested':
      return `${textOf(event['approvalKind'])} ${clip(textOf(event['command']))}`
    case 'hostEvent':
    case 'guardEvent':
      return `${textOf(event['method'])} · ${describePayload(event['event'])}`
    case 'threadEvent':
      return describePayload(event['event'])
    case 'terminalEvent':
      return clip(textOf(event['delta']) || textOf(event['execId']))
    case 'debugEvent':
      return textOf(event['method'])
    case 'unhandled':
      return `${textOf(event['method'])}（未建模）`
    default:
      return type
  }
}

/** 从任意值里取可显示文本。 */
export function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  return value === undefined || value === null ? '' : String(value)
}

/** 摘要统一截到 80 字：再长表格的一行就读不下去了。 */
export function clip(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/** 命令类入参补一句命令行——那通常是这一行最想看到的东西。 */
function argHint(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const value = (input as Record<string, unknown>)['command']
  return typeof value === 'string' ? ` ${clip(value, 40)}` : ''
}

/** host/guard 事件的载荷带 `kind` 字段（见 eventPayloads.ts），那就是摘要。 */
function describePayload(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const kind = (payload as Record<string, unknown>)['kind']
    if (typeof kind === 'string') return kind
  }
  return ''
}

/** userMessage 的 content 是 UserInput 数组，摘要只要纯文本。 */
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
    .join(' ')
}