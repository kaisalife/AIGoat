/**
 * dock 的公共形状。
 *
 * 单独成文件是为了打破循环：`tabRegistry` 要引用 `DockPanelProps`，
 * 各 tab 组件要引用注册表，两边都需要这个类型。
 */

import type { DockTabId } from './tabRegistry'

export interface DockPanelProps {
  /** 面板所属的 tab（多实例时同一 tab 可能有几个面板同时存在）。 */
  tabId: DockTabId
  /** 当前会话 id。终端与文件树按工作区而非会话，但预览要用（相对路径基准）。 */
  threadId: string | null
}

export interface DockLayout {
  /** 从左到右的 tab 序列（重复的 id = 多实例）。 */
  open: DockTabId[]
  /** 活动 tab（`open` 里的某个值）。 */
  active: DockTabId | null
}