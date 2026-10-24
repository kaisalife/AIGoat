/**
 * 文件树 + 预览面板的状态（10 号板块迁入 dock 之后）。
 *
 * 文件树懒加载：只展开用户点开的目录，每次调 `bridge_fs_list` 读一层。
 * 预览：打开的文本 / 图片 / 二进制文件；文本编辑用 CodeMirror，
 * 内容以"最后一次 onChange 的值"为准，保存时写回磁盘并清脏标记。
 *
 * 原先这里还有一个 `drawerOpen`（消息流底部的抽屉）与 `open`（左栏里的
 * 文件树列）。两者都随 Explorer/EditorDrawer 一起退役了——文件树现在是
 * dock 的「文件」tab，预览是「预览」tab，"开没开"由 tab 布局回答，
 * 不该再由这里记一份（两份状态必然会打架）。
 */

import { create } from 'zustand'
import type { FsEntry, FsReadResult } from '../bridge/client'
import { getClient } from '../bridge/session'

export type FileKind = FsReadResult['kind']

export interface OpenFile {
  path: string
  name: string
  kind: FileKind
  dirty: boolean
  content?: string
  size?: number
}

interface EditorState {
  treeRoot: string | null
  tree: FsEntry[]
  /** 目录路径 → 已加载的子项。key 存在即视为"已展开"。 */
  expanded: Record<string, FsEntry[]>
  showAll: boolean
  openFiles: OpenFile[]
  activeFile: string | null
  loading: boolean
  error: string | null

  setShowAll: (v: boolean) => void
  reset: (root: string) => Promise<void>
  loadTree: (root: string) => Promise<void>
  toggleDir: (dir: string) => Promise<void>
  openFile: (path: string) => Promise<void>
  closeFile: (path: string) => void
  setActiveFile: (path: string) => void
  /** 页签拖拽重排：把 `from` 位置的文件移到 `to` 位置。 */
  moveFile: (from: number, to: number) => void
  updateFile: (path: string, content: string) => void
  save: (path: string) => Promise<void>
  reveal: (path: string) => Promise<void>
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export const useEditor = create<EditorState>()((set, get) => {
  const client = getClient()

  return {
    treeRoot: null,
    tree: [],
    expanded: {},
    showAll: false,
    openFiles: [],
    activeFile: null,
    loading: false,
    error: null,

    setShowAll(v) {
      set({ showAll: v, expanded: {} })
      const root = get().treeRoot
      if (root) void get().loadTree(root)
    },

    /** 切换工作区时调用：清空编辑器状态，重新读树。 */
    async reset(root) {
      set({ openFiles: [], activeFile: null, expanded: {}, error: null })
      await get().loadTree(root)
    },

    async loadTree(root) {
      set({ loading: true, error: null, treeRoot: root })
      try {
        const tree = await client.fsList(root, get().showAll)
        set({ tree, loading: false })
      } catch (err) {
        set({ error: describe(err), loading: false })
      }
    },

    async toggleDir(dir) {
      if (get().expanded[dir]) {
        const expanded = { ...get().expanded }
        delete expanded[dir]
        set({ expanded })
        return
      }
      set({ error: null })
      try {
        const children = await client.fsList(dir, get().showAll)
        set({ expanded: { ...get().expanded, [dir]: children } })
      } catch (err) {
        set({ error: describe(err) })
      }
    },

    async openFile(path) {
      const existing = get().openFiles.find((f) => f.path === path)
      if (existing) {
        set({ activeFile: path })
        return
      }
      set({ error: null })
      try {
        const result = await client.fsRead(path)
        const file: OpenFile = {
          path,
          name: baseName(path),
          kind: result.kind,
          dirty: false,
          content: result.kind === 'text' || result.kind === 'image' ? result.content : undefined,
          size: result.size,
        }
        set({ openFiles: [...get().openFiles, file], activeFile: path })
      } catch (err) {
        set({ error: describe(err) })
      }
    },

    closeFile(path) {
      const openFiles = get().openFiles.filter((f) => f.path !== path)
      let activeFile = get().activeFile
      if (activeFile === path) activeFile = openFiles[openFiles.length - 1]?.path ?? null
      set({ openFiles, activeFile })
    },

    setActiveFile(path) {
      set({ activeFile: path })
    },

    moveFile(from, to) {
      const openFiles = get().openFiles
      if (from === to) return
      if (from < 0 || to < 0 || from >= openFiles.length || to >= openFiles.length) return
      const next = openFiles.slice()
      const [moved] = next.splice(from, 1)
      if (!moved) return
      next.splice(to, 0, moved)
      set({ openFiles: next })
    },

    updateFile(path, content) {
      set({
        openFiles: get().openFiles.map((f) =>
          f.path === path ? { ...f, content, dirty: true } : f,
        ),
      })
    },

    async save(path) {
      const file = get().openFiles.find((f) => f.path === path)
      if (!file || !file.dirty || file.content === undefined) return
      set({ error: null })
      try {
        await client.fsWrite(path, file.content)
        set({
          openFiles: get().openFiles.map((f) =>
            f.path === path ? { ...f, dirty: false } : f,
          ),
        })
      } catch (err) {
        set({ error: describe(err) })
      }
    },

    async reveal(path) {
      try {
        await client.fsReveal(path)
      } catch (err) {
        set({ error: describe(err) })
      }
    },
  }
})

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}