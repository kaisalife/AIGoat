/**
 * 附件草稿轨（11 号板块）。
 *
 * # 为什么存的是**路径**而不是 File
 *
 * 协议的 `UserInput` 有 `localImage: { type, path }` 这一项——直接带本地
 * 路径，codex 自己读。所以草稿轨不需要把图片读进内存、不需要 base64、
 * 也不必先 `thread/attachment/add`（17 号 §5.8 已核实）。
 *
 * 拖放用 Tauri 的 `onDragDropEvent` 而不是 HTML5 的 DataTransfer：
 * 后者只给 `File` 对象、**拿不到路径**，那样就只能是"读进内存再转 base64"
 * 的另一条路——为了绕开它而多背一份图片，是本末倒置。
 *
 * # 上限 20MB
 *
 * 11 号文件定的。图片走 base64 或路径都要经过 codex 与模型的上下文，
 * 超过这个量基本等于把会话塞满。超限时**拒收并说明**，不静默丢弃——
 * 用户拖了个大图发现什么都没发生，会以为功能坏了。
 */

import { create } from 'zustand'
import { getClient } from '../bridge/session'
import { getFileExtension } from '../shared/getFileExtension'
import type { UserInput } from '../bridge/types'

/** 单个附件的大小上限。超过就拒收。 */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

/** 一次最多几张。太多的话消息流里的缩略图队列就没法看了。 */
export const MAX_DRAFTS = 8

/** 只有这些扩展名会进草稿轨。别的（PDF、zip）codex 也接，但本应用不预览。 */
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])

export interface DraftImage {
  id: string
  /** 送进 `UserInput.localImage.path` 的绝对路径。 */
  path: string
  name: string
  size: number
  /** data URL 缩略图。读失败时为 null——不影响发送，只是不显示图。 */
  preview: string | null
}

interface DraftState {
  drafts: DraftImage[]
  /** 上一批被拒收的路径与原因，界面要显示出来。 */
  rejected: { path: string; reason: string }[]
  dragging: boolean
  setDragging: (dragging: boolean) => void
  addPaths: (paths: string[]) => Promise<void>
  remove: (id: string) => void
  clear: () => void
  clearRejected: () => void
  /** 组装 `UserInput[]`：正文在前，图片在后。 */
  buildInput: (text: string) => UserInput[]
}

let seq = 0

export const useDrafts = create<DraftState>()((set, get) => ({
  drafts: [],
  rejected: [],
  dragging: false,

  setDragging(dragging) {
    set({ dragging })
  },

  async addPaths(paths) {
    const client = getClient()
    const accepted: DraftImage[] = []
    const rejected: { path: string; reason: string }[] = []

    for (const path of paths) {
      const name = baseName(path)
      const ext = getFileExtension(name)

      if (!IMAGE_EXT.has(ext)) {
        rejected.push({ path, reason: `${ext || '无扩展名'} 不是图片` })
        continue
      }
      if (get().drafts.length + accepted.length >= MAX_DRAFTS) {
        rejected.push({ path, reason: `一次最多 ${MAX_DRAFTS} 张` })
        continue
      }
      const duplicate = [...get().drafts, ...accepted].find((d) => d.path === path)
      if (duplicate) continue

      // 尺寸只能靠 fs_read 探（没有 stat 命令）：读成功才知道多大。
      // 读失败不拒收——协议要的是路径，codex 那边读得到就行，预览读不到
      // 只是界面上少张缩略图。
      let size = 0
      let preview: string | null = null
      try {
        const result = await client.fsRead(path)
        size = result.size
        if (result.kind === 'image') preview = `data:${mimeOf(ext)};base64,${result.content}`
      } catch (err) {
        rejected.push({ path, reason: `读取失败：${message(err)}` })
        continue
      }
      if (size > MAX_ATTACHMENT_BYTES) {
        rejected.push({ path, reason: `${formatSize(size)} 超过 20MB 上限` })
        continue
      }

      seq += 1
      accepted.push({ id: `d${seq}`, path, name, size, preview })
    }

    set({ drafts: [...get().drafts, ...accepted], rejected: [...get().rejected, ...rejected] })
  },

  remove(id) {
    set({ drafts: get().drafts.filter((d) => d.id !== id) })
  },

  clear() {
    set({ drafts: [], rejected: [] })
  },

  clearRejected() {
    set({ rejected: [] })
  },

  buildInput(text) {
    const input: UserInput[] = []
    const body = text.trim()
    if (body) input.push({ type: 'text', text: body, text_elements: [] })
    // 正文在前图片在后：模型读到的顺序与界面上看到的缩略图队列一致。
    for (const draft of get().drafts) {
      input.push({ type: 'localImage', path: draft.path })
    }
    return input
  },
}))

/** 有附件时输入框要用它的多行形态（路径值不止一个字）。 */
export function isMultilineInput(input: UserInput[]): boolean {
  return input.length > 1 || (input[0]?.type !== 'text' && input.length === 1)
}

function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i >= 0 ? path.slice(i + 1) : path
}

function mimeOf(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  }
  return map[ext] ?? 'application/octet-stream'
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}