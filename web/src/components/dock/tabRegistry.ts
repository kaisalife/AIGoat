/**
 * tab 类型注册表（抄 dsh 的 `ui-sidebar-right` 分发思想，砍掉 glob 匹配）。
 *
 * # 为什么是注册表而不是 switch
 *
 * dsh 用 `dsh-resource://` 地址 glob 分发，代价是「一个 tab 从哪来」要
 * 查协议。我们只有固定七八种类型，直查表就够——但**保留注册表这个形状**，
 * 这样将来 AF 相关的 tab 想插进来时有个明确的位置（`source: 'extension'`），
 * 而不是去改 DockShell 里的 switch。
 *
 * # 两种来源
 *
 * - `builtin`：固定几种（终端/文件/预览/技能/MCP/权限/上下文）
 * - `extension`：预留给子 Agent 插件（09 板块）。现在为空，但类型先留好——
 *  将来加的时候不用改这张表的形状。
 */

import type { ComponentType } from 'react'
import type { DockPanelProps } from './types'

export type DockTabId =
  | 'terminal'
  | 'files'
  | 'preview'
  | 'skills'
  | 'attachments'
  | 'mcp'
  | 'review'
  | 'subagent'
  | 'team'
  | 'plan'
  | 'permissions'
  | 'context'

export type TabSource = 'builtin' | 'extension'

export interface TabDef {
  id: DockTabId
  title: string
  /** 单字图标。刻意不用图标库——七八个 tab 不值得多一个依赖。 */
  glyph: string
  source: TabSource
  /**
   * 同一 tab 可以开多个实例（终端就是这样）。
   * 单实例的 tab 重复打开只切到已存在的那一个。
   */
  multi: boolean
  /**
   * tab 标题右侧的摘要（"3/5 已连接"、"12k tokens"）。
   *
   * 给的是**组件**而不是字符串：摘要要读各自的 store 切片，
   * 写成组件才能在 React 的规则下正当地用 hook。DockTabs 只负责把它
   * 放进 tab 按钮里，不关心它读什么。
   */
  badge?: ComponentType
  render: ComponentType<DockPanelProps>
}

const TABLE = new Map<DockTabId, TabDef>()

export function registerTab(def: TabDef): void {
  TABLE.set(def.id, def)
}

export function getTab(id: DockTabId): TabDef | undefined {
  return TABLE.get(id)
}

export function allTabs(): TabDef[] {
  return [...TABLE.values()]
}

export function tabsBySource(source: TabSource): TabDef[] {
  return allTabs().filter((t) => t.source === source)
}

/**
 * `open` 里给一个 id 找位置：多实例 tab 找**最近打开的那个**，单实例找它自己。
 *
 * 找最近而不是第一个：用户从 tab A 切到 B 再切回来，期望回到刚才那个
 * 实例，不是列表里最早的那个。
 */
export function findTab(open: DockTabId[], id: DockTabId, multi: boolean): number {
  const candidates = open.map((tab, index) => ({ tab, index })).filter((x) => x.tab === id)
  if (candidates.length === 0) return -1
  return multi ? candidates[candidates.length - 1]!.index : candidates[0]!.index
}