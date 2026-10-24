/**
 * 客户端工具注册表（05/12 号文件的「客户端工具闭环」）。
 *
 * # 为什么需要它
 *
 * `item/tool/call` 是 codex 向**宿主**要一个工具的结果。之前这里只插了
 * 一条占位卡片，永不应答——那一轮会永远挂着，界面上表现为「Agent 一直
 * 在转」。这不是显示问题，是协议闭环断了。
 *
 * # 闭环长什么样
 *
 * 1. codex 发 `item/tool/call`（带 `tool` / `arguments`）
 * 2. 这里查注册表；找到就执行
 * 3. 无论成功、失败、还是没注册，**都必须回一次应答**
 *
 * 第 3 条是关键：没注册的工具要显式回一个「宿主不支持」的错误，
 * 而不是装死。装死的话模型会一直等，用户看到的还是转圈。
 *
 * # 第一个执行器为什么是本地文件
 *
 * 协议里 `fs/*` 是**方法**（客户端→codex），我们明确不接（17 号文件）；
 * 而这里是反方向——codex 要宿主替它读文件。宿主已经有 `bridge_fs_*`
 * 一套成熟实现，所以直接复用它，不重写。
 */

import { getClient } from '../bridge/session'
import type { FsEntry } from '../bridge/client'

/** 工具执行结果。形状对应协议的 `DynamicToolCallOutputContentItem`。 */
export interface ToolContentItem {
  type: 'inputText'
  text: string
}

export interface ToolResult {
  contentItems: ToolContentItem[]
  success: boolean
}

export type ToolHandler = (args: unknown) => Promise<string>

const registry = new Map<string, ToolHandler>()

/** 注册一个客户端工具。同名覆盖——后注册的赢。 */
export function registerClientTool(name: string, handler: ToolHandler): void {
  registry.set(name, handler)
}

export function unregisterClientTool(name: string): void {
  registry.delete(name)
}

export function hasClientTool(name: string): boolean {
  return registry.has(name)
}

/** 交给 codex 的工具清单。注册一个就自动出现在这里。 */
export function clientToolNames(): string[] {
  return [...registry.keys()]
}

/**
 * 执行一个被 codex 点名的客户端工具，并**必定**应答。
 *
 * 返回值是给界面看的成败；真正的应答已经发出去了。
 */
export async function executeClientTool(
  requestId: unknown,
  tool: string,
  args: unknown,
): Promise<{ ok: boolean; message: string }> {
  const handler = registry.get(tool)

  if (!handler) {
    const message = `宿主未实现工具 ${tool}（已登记：${clientToolNames().join('、') || '无'}）`
    await getClient().respondError(requestId, message).catch((err) => {
      console.error(`[clientTools] respondError failed: ${err}`)
    })
    return { ok: false, message }
  }

  try {
    const text = await handler(args)
    const result: ToolResult = {
      contentItems: [{ type: 'inputText', text }],
      success: true,
    }
    await getClient().respondToolCall(requestId, result.contentItems, result.success)
    return { ok: true, message: text }
  } catch (err) {
    // 失败也必须应答：success=false 让模型知道"试过了但没成"，
    // 它会换个办法；不答就是死等。
    const message = err instanceof Error ? err.message : String(err)
    const result: ToolResult = {
      contentItems: [{ type: 'inputText', text: `执行失败：${message}` }],
      success: false,
    }
    await getClient().respondToolCall(requestId, result.contentItems, false).catch((err) => {
      console.error(`[clientTools] respondToolCall failed: ${err}`)
    })
    return { ok: false, message }
  }
}

/**
 * 注册内置的那几个。
 *
 * 只暴露**只读**的三个：codex 要宿主读文件是可以的，让它写文件要走
 * 审批流程（12 号文件），不能从这条旁路绕过——那等于开了一个不用审批
 * 的写盘口子。
 */
export function installBuiltinClientTools(): void {
  registerClientTool('fs_read', async (args) => {
    const path = readString(args, 'path')
    if (!path) throw new Error('缺少 path')
    const result = await getClient().fsRead(path)
    return textOf(result)
  })

  registerClientTool('fs_list', async (args) => {
    const dir = readString(args, 'dir') ?? readString(args, 'path')
    if (!dir) throw new Error('缺少 dir')
    const entries: FsEntry[] = await getClient().fsList(dir, readBool(args, 'includeIgnored'))
    return JSON.stringify(entries, null, 2)
  })

  registerClientTool('fs_stat', async (args) => {
    const path = readString(args, 'path')
    if (!path) throw new Error('缺少 path')
    // 没有独立的 stat 命令：用 list 拿父目录再筛，等于复用现有通道。
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    // 注意 `slash === 0`：那是绝对根路径（`/foo`），不是"没有分隔符"。
    // 写成 `slash > 0` 的话 dir 会退化成 '.'、base 变成 '/foo'，
    // 于是拿 cwd 去列、找一个叫 "/foo" 的条目，永远匹配不上。
    const dir = slash >= 0 ? path.slice(0, slash) || '/' : '.'
    const base = slash >= 0 ? path.slice(slash + 1) : path
    if (!base) throw new Error(`路径不完整：${path}`)
    const entries: FsEntry[] = await getClient().fsList(dir, true)
    // 按 `name` 精确比，**不要用 `path.endsWith(base)`**：那是后缀匹配，
    // `/x/myfoo.ts` 会先命中列表里的 `/x/foo.ts`，返回另一个文件的内容。
    const hit = entries.find((e) => e.name === base) ?? entries.find((e) => e.path === path)
    if (!hit) throw new Error(`找不到 ${path}`)
    return JSON.stringify(hit, null, 2)
  })
}

function readString(args: unknown, key: string): string | undefined {
  if (!args || typeof args !== 'object') return undefined
  const value = (args as Record<string, unknown>)[key]
  return typeof value === 'string' && value ? value : undefined
}

function readBool(args: unknown, key: string): boolean | undefined {
  if (!args || typeof args !== 'object') return undefined
  const value = (args as Record<string, unknown>)[key]
  return typeof value === 'boolean' ? value : undefined
}

/** fs_read 回的是 `{text}` 或 `{bytesBase64}`，前者转成纯文本。 */
function textOf(result: unknown): string {
  if (typeof result === 'string') return result
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>
    if (typeof record['text'] === 'string') return record['text']
    if (typeof record['bytesBase64'] === 'string') {
      return `[二进制内容 ${record['bytesBase64'].length} 字节 base64]`
    }
  }
  return JSON.stringify(result, null, 2)
}