/**
 * 每线程的 dock 布局，落**安装目录** `ui-state.json` 的 `dock.<threadId>` 段。
 *
 * # 为什么不跟布局宽度放一起
 *
 * 列宽是全局的（就一条左栏/右栏），dock 内容是每会话的。混在一个段里
 * 会让「切会话」顺手改掉用户的列宽——那显然不是用户想要的。
 *
 * # 为什么不用 localStorage
 *
 * 00 铁律：前端持久化一律走配置文件。WebView 的 localStorage 落 C 盘
 * AppData，用户既找不到也没法备份，还和另外两个配置文件各散一处。
 *
 * # 泄漏防护
 *
 * 会话被删后 dock 条目会留下（`bridge_ui_state_prune_dock` 在桥接侧按存活
 * 会话清理）。不清的话这个文件只增不减，一年下来每个会话留一条垃圾。
 *
 * 布局表放在 store **内部**（而不是模块级变量）：外部对象改了不会通知
 * 订阅者，切会话时 tab 条就不会跟着变。
 */

import { create } from 'zustand'
import { flushUiState, patchUiState, readUiState } from '../layout/uiStateChannel'
import { getTab, type DockTabId } from './tabRegistry'
import type { DockLayout } from './types'

/** 没有任何布局记录时的默认：文件树 + 预览，右栏一打开就有东西。 */
export const DEFAULT_LAYOUT: DockLayout = { open: ['files', 'preview'], active: 'files' }

/** 无会话时（还没打开工作区）用的伪 key。 */
const NO_THREAD = '__none__'

interface DockStore {
  layouts: Record<string, DockLayout>
  hydrated: boolean
  hydrate: () => Promise<void>
  layoutOf: (threadId: string | null) => DockLayout
  openTab: (id: DockTabId, threadId: string | null) => void
  closeTab: (id: DockTabId, threadId: string | null, index?: number) => void
  selectTab: (id: DockTabId, threadId: string | null) => void
  /** 拖拽重排。dsh 有完整布局引擎，我们只支持重排。 */
  moveTab: (from: number, to: number, threadId: string | null) => void
  /** 会话被删后清掉它们的布局条目（按 id 精确移除，不动别的会话）。 */
  forget: (ids: readonly string[]) => void
  /** 拖拽结束：立刻落盘，不等防抖。 */
  commit: () => void
}

function keyOf(threadId: string | null): string {
  return threadId ?? NO_THREAD
}

export const useDockStore = create<DockStore>()((set, get) => ({
  layouts: {},
  hydrated: false,

  async hydrate() {
    const state = await readUiState()
    // 整段换掉：上一次进程里可能有已删会话的残留。
    const layouts: Record<string, DockLayout> = {}
    for (const [key, value] of Object.entries(state.dock ?? {})) {
      const layout = value as Partial<DockLayout> | null
      if (!layout || !Array.isArray(layout.open)) continue
      layouts[key] = { open: layout.open, active: layout.active ?? layout.open[0] ?? null }
    }
    set({ layouts, hydrated: true })
  },

  layoutOf(threadId) {
    return get().layouts[keyOf(threadId)] ?? DEFAULT_LAYOUT
  },

  openTab(id, threadId) {
    const layout = get().layoutOf(threadId)
    const multi = getTab(id)?.multi === true
    // 单实例 tab 已经开着就只切过去——用户点两遍"文件"不该得到两个。
    if (!multi && layout.open.includes(id)) {
      save(set, get, threadId, { ...layout, active: id })
      return
    }
    save(set, get, threadId, { open: [...layout.open, id], active: id })
  },

  closeTab(id, threadId, index) {
    const layout = get().layoutOf(threadId)
    // 多实例 tab 关的是**指定那一个**；不给 index 就关最后一个。
    const at =
      index ??
      (() => {
        const hits = layout.open.map((t, i) => ({ t, i })).filter((x) => x.t === id)
        return hits[hits.length - 1]?.i ?? -1
      })()
    if (at < 0) return

    const open = layout.open.filter((_, i) => i !== at)
    if (layout.active !== id) {
      save(set, get, threadId, { ...layout, open })
      return
    }
    // 关掉活动的那一个：活动权交给左邻，没有左邻就给右邻。
    save(set, get, threadId, { open, active: open[at - 1] ?? open[at] ?? null })
  },

  selectTab(id, threadId) {
    const layout = get().layoutOf(threadId)
    if (layout.active === id) return
    save(set, get, threadId, { ...layout, active: id })
  },

  moveTab(from, to, threadId) {
    const layout = get().layoutOf(threadId)
    if (from === to || from < 0 || from >= layout.open.length || to < 0 || to >= layout.open.length) {
      return
    }
    const open = [...layout.open]
    const [moved] = open.splice(from, 1)
    if (moved === undefined) return
    open.splice(to, 0, moved)
    save(set, get, threadId, { ...layout, open })
  },

  forget(ids) {
    if (ids.length === 0) return
    const gone = new Set(ids)
    // NO_THREAD 是"还没打开工作区"的伪 key，不是会话 id，永远保留。
    const layouts: Record<string, DockLayout> = {}
    let changed = false
    for (const [key, layout] of Object.entries(get().layouts)) {
      if (key !== NO_THREAD && gone.has(key)) {
        changed = true
        continue
      }
      layouts[key] = layout
    }
    if (!changed) return
    set({ layouts })
    // 必须同时落盘：`save` 是整段覆写，内存里删了不写会被下一次操作又带回去。
    patchUiState({ dock: { ...layouts } })
  },

  commit() {
    void flushUiState()
  },
}))

type SetState = (partial: Partial<DockStore>) => void
type GetState = () => DockStore

function save(set: SetState, get: GetState, threadId: string | null, layout: DockLayout): void {
  const key = keyOf(threadId)
  const layouts = { ...get().layouts, [key]: layout }
  set({ layouts })
  patchUiState({ dock: { ...layouts } })
}

/** 订阅某个会话的布局。组件用这个，别直接摸 store 内部。 */
export function useDockLayout(threadId: string | null): DockLayout {
  return useDockStore((s) => s.layouts[keyOf(threadId)] ?? DEFAULT_LAYOUT)
}

/**
 * 打开一个 tab；已经开着就把它切到前台。
 *
 * 供顶栏按钮与快捷键用（`Ctrl+E`）——它们不属于任何面板，但操作的是
 * dock 的布局，所以走 dock 自己的 store 而不是从 App 里层层往下传回调。
 */
export function toggleDockTab(id: DockTabId): void {
  const { layoutOf, openTab } = useDockStore.getState()
  // 这里没有会话上下文（顶栏/快捷键是全局的），用当前会话的布局判定。
  const threadId = currentThreadId()
  const layout = layoutOf(threadId)
  if (layout.active === id && layout.open.includes(id)) {
    // 已经在前台 → 什么都不做。再点一次"关掉"会让顶栏按钮行为不可预测
    //（有时是切走、有时是关闭），所以只做"打开/切到前台"。
    return
  }
  openTab(id, threadId)
}

/** 当前会话 id。由 DockShell 在挂载时登记（它已经在订阅 activeThreadId）。 */
let currentThreadId: () => string | null = () => null

export function bindCurrentThreadId(fn: () => string | null): void {
  currentThreadId = fn
}