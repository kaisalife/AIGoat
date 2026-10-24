import { create } from 'zustand'
import type { MainViewName } from '../../bridge/client'
import {
  flushUiState,
  patchUiState,
  readUiState,
} from './uiStateChannel'
import {
  clampWidth,
  RIGHTBAR_DEFAULT,
  RIGHTBAR_MIN,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
} from './columns'

export interface LayoutState {
  sidebarWidth: number
  rightbarWidth: number
  /** 左栏折叠成 56px rail。 */
  sidebarCollapsed: boolean
  /** 右栏是否占位（关掉时中栏不为其让位）。 */
  rightOpen: boolean
  /** 中栏视图环：会话正文 / 事件回放。 */
  mainView: MainViewName
  /** 是否已从 ui-state.json 读回真实值。 */
  hydrated: boolean

  hydrate: () => Promise<void>
  setSidebarWidth: (width: number) => void
  setRightbarWidth: (width: number) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleRight: () => void
  setMainView: (view: MainViewName) => void
  /** 拖拽结束：立刻写盘，不再等防抖。 */
  commit: () => void
}

/**
 * 三栏布局状态。
 *
 * 落盘在 `ui-state.json` 的 `layout` 段（经 bridge_ui_state_*），不是
 * localStorage。右栏 dock 的**每会话**布局同存该文件的 `dock.<threadId>`
 * 段，见 docs/10。
 */
export const useLayoutStore = create<LayoutState>()((set, get) => {
  /** 落盘只写 layout 段，别把整个 cache 里的 dock 段也搅进来。 */
  const persist = () =>
    patchUiState({
      layout: {
        sidebar: get().sidebarWidth,
        rightbar: get().rightbarWidth,
        sidebarCollapsed: get().sidebarCollapsed,
        rightOpen: get().rightOpen,
        mainView: get().mainView,
      },
    })

  return {
    sidebarWidth: SIDEBAR_DEFAULT,
    rightbarWidth: RIGHTBAR_DEFAULT,
    sidebarCollapsed: false,
    rightOpen: true,
    mainView: 'chat',
    hydrated: false,

    async hydrate() {
      const state = await readUiState()
      const layout = state.layout ?? {}
      set({
        sidebarWidth: clampWidth(layout.sidebar ?? SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX),
        rightbarWidth: clampWidth(layout.rightbar ?? RIGHTBAR_DEFAULT, RIGHTBAR_MIN, 2000),
        sidebarCollapsed: layout.sidebarCollapsed === true,
        rightOpen: layout.rightOpen !== false,
        mainView: layout.mainView === 'trajectory' ? 'trajectory' : 'chat',
        hydrated: true,
      })
    },

    setSidebarWidth(width) {
      set({ sidebarWidth: clampWidth(width, SIDEBAR_MIN, SIDEBAR_MAX) })
      persist()
    },

    setRightbarWidth(width) {
      set({ rightbarWidth: clampWidth(width, RIGHTBAR_MIN, 2000) })
      persist()
    },

    toggleSidebar() {
      set({ sidebarCollapsed: !get().sidebarCollapsed })
      persist()
    },

    setSidebarCollapsed(sidebarCollapsed) {
      set({ sidebarCollapsed })
      persist()
    },

    toggleRight() {
      set({ rightOpen: !get().rightOpen })
      persist()
    },

    setMainView(mainView) {
      set({ mainView })
      persist()
    },

    commit() {
      void flushUiState()
    },
  }
})