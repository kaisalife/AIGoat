import { create } from 'zustand'

/**
 * 工作详情档位（04 号板块 §1 的「4 档」，06 号板块补齐第 4 档）。
 *
 * 同一事件流的四种投影，不是四份数据：
 * - 0 **概要**：只看最终答复，过程全部折叠
 * - 1 **常规**：过程组可展开，工具卡只出摘要
 * - 2 **全部细节**：工具卡展开完整输出与 diff
 * - 3 **原始事件**：把账本表格也摊开在消息流下面（06 号板块）
 *
 * 第 4 档终于可用：账本在 E 期落地后，"看一眼模型到底收到了什么"不再
 * 需要切到 Trajectory 视图。
 */
export type DetailLevel = 0 | 1 | 2 | 3

export const DETAIL_LABELS: Record<DetailLevel, string> = {
  0: '概要',
  1: '常规',
  2: '全部细节',
  3: '原始事件',
}

/** 右栏区块的折叠态。 */
type PanelKey = string

interface UiState {
  detailLevel: DetailLevel
  panels: Record<PanelKey, boolean>
  setDetailLevel: (level: DetailLevel) => void
  setPanel: (key: PanelKey, open: boolean) => void
  togglePanel: (key: PanelKey) => void
}

/**
 * 右栏内部区块的折叠态。
 *
 * 只放**当前这一屏**的展开/收起——多数时候用户不需要同时看到它们。
 *
 * 刻意**不持久化**（原实现用的是 localStorage）：折叠态不是偏好，
 * 下次打开就该回到默认。而且按 00 铁律，前端持久化一律走配置文件，
 * 不用 localStorage；把它写进 ui-state.json 只会让那个文件多一堆没人
 * 需要读的键。
 *
 * 右栏**每会话**的 dock 布局（哪个 tab 打开、面板宽度）才需要落盘，
 * 那部分在 `useLayoutStore` + docs/10。
 */
export const useUi = create<UiState>()((set, get) => ({
  detailLevel: 1,
  panels: {},

  setDetailLevel: (detailLevel) => set({ detailLevel }),

  setPanel: (key, open) => set({ panels: { ...get().panels, [key]: open } }),

  togglePanel: (key) => {
    const panels = get().panels
    set({ panels: { ...panels, [key]: !panels[key] } })
  },
}))

/** 详情档位是否该展开过程组 / 工具卡的正文。 */
export function expandsProcess(level: DetailLevel): boolean {
  return level >= 1
}

export function expandsToolBody(level: DetailLevel): boolean {
  return level >= 2
}

/** 第 4 档：把事件账本摊在消息流下面。 */
export function showsLedger(level: DetailLevel): boolean {
  return level >= 3
}

/** 主栏视图（chat / trajectory）在 `useLayoutStore`——它属于布局而不是这里的折叠态。 */
export type { MainViewName } from '../bridge/client'