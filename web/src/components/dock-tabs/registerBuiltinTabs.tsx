/**
 * 内置 tab 的注册。
 *
 * 单独成文件（而不是写在 `tabRegistry.ts` 里）是为了打破循环：
 * 注册表要引用这些组件，组件又要引用注册表的类型。
 *
 * 注册放在模块顶层而不是渲染里：注册是纯查表、读多写极少，
 * 每次渲染重注册只会白白重建 Map。
 */

import { lazy, type ComponentType } from 'react'
import { registerTab, type DockTabId } from '../dock/tabRegistry'
import type { DockPanelProps } from '../dock/types'
import { sandboxLabel } from '../../store/resources'
import { useResources } from '../../store/resources'
import { useEditor } from '../../store/editor'
import { useShell } from '../../store/shell'
import { useTerminals } from '../../store/terminals'

/**
 * 面板**按需加载**：只有真的打开某个 tab 时才去拉它的 chunk。
 *
 * 这里收益最大的是「预览」——它带 CodeMirror（几百 KB），而冷启动时右栏
 * 默认停在「文件」，根本用不到编辑器。之前所有面板都在 `registerBuiltinTabs`
 * 顶层静态 import，于是 CodeMirror 连同终端 / 技能 / MCP 全被打进首屏包。
 *
 * `lazy()` 本身很轻（只登记一个 loader），真正的 `import()` 在首次渲染时
 * 才发生；调用方（DockShell）用 `<Suspense>` 兜住加载窗口。
 * 用 `as ComponentType` 抹平 `LazyExoticComponent` 与普通组件在 TS 上的差异：
 * 二者在 JSX 里等价，而注册表继续只认一种形状。
 */
const panel = (loader: () => Promise<{ default: ComponentType<DockPanelProps> }>) =>
  lazy(loader) as unknown as ComponentType<DockPanelProps>

const FilesTab = panel(() => import('./FilesTab').then((m) => ({ default: m.FilesTab })))
const PreviewTab = panel(() => import('./PreviewTab').then((m) => ({ default: m.PreviewTab })))
const TerminalTab = panel(() => import('./TerminalTab').then((m) => ({ default: m.TerminalTab })))
const SkillsTab = panel(() => import('./SkillsTab').then((m) => ({ default: m.SkillsTab })))
const McpTab = panel(() => import('./SkillsTab').then((m) => ({ default: m.McpTab })))
const PermissionsTab = panel(() =>
  import('./PermissionsTab').then((m) => ({ default: m.PermissionsTab })),
)
const ContextTab = panel(() =>
  import('./PermissionsTab').then((m) => ({ default: m.ContextTab })),
)
const PlanDocTab = panel(() => import('../plan/PlanDocTab').then((m) => ({ default: m.PlanDocTab })))
const TeamTab = panel(() => import('../team/TeamTab').then((m) => ({ default: m.TeamTab })))
const SubagentReadonlyTab = panel(() =>
  import('../subagent/SubagentReadonlyTab').then((m) => ({ default: m.SubagentReadonlyTab })),
)
const AttachmentGallery = panel(() =>
  import('../attachment/AttachmentGallery').then((m) => ({ default: m.AttachmentGallery })),
)
const ReviewQueueTab = panel(() =>
  import('../deliverables/ReviewQueueTab').then((m) => ({ default: m.ReviewQueueTab })),
)

// ------------------------------------------------------------------ 摘要
// 每个摘要只订阅自己需要的那一个切片——tab 条上七个子组件，
// 各自订阅比在父层合并订阅更省渲染。

function NoBadge() {
  return null
}

function TerminalBadge() {
  const count = useTerminals((s) => s.instances.length)
  const running = useTerminals(
    (s) => s.instances.filter((t) => !t.ended).length,
  )
  if (count === 0) return null
  return (
    <span className={TAB_BADGE}>
      {running}/{count}
    </span>
  )
}

function PreviewBadge() {
  const count = useEditor((s) => s.openFiles.length)
  const dirty = useEditor((s) => s.openFiles.filter((f) => f.dirty).length)
  if (count === 0) return null
  return (
    <span className={TAB_BADGE} title={dirty > 0 ? `${dirty} 个有未保存改动` : undefined}>
      {count}
      {dirty > 0 ? '*' : ''}
    </span>
  )
}

function SkillsBadge() {
  const skills = useResources((s) => s.skills.length)
  const hooks = useResources((s) => s.hooks.length)
  const total = skills + hooks
  return total > 0 ? <span className={TAB_BADGE}>{total}</span> : null
}

function McpBadge() {
  const servers = useResources((s) => s.mcpServers)
  if (servers.length === 0) return null
  const up = servers.filter((s) => s.runtimeStatus === 'connected').length
  return (
    <span className={TAB_BADGE} title="已连接 / 总数">
      {up}/{servers.length}
    </span>
  )
}

function PermissionsBadge() {
  const status = useResources((s) => s.sandbox?.status)
  if (status === undefined) return null
  return <span className={TAB_BADGE}>{sandboxLabel(status)}</span>
}

function ContextBadge() {
  const total = useShell((s) => s.tokens.total)
  return total > 0 ? <span className={TAB_BADGE}>{total}</span> : null
}

/** 摘要的类名。放在这里是因为摘要散在各 tab 文件里，不该各自硬编码一遍。 */
const TAB_BADGE = 'dockTabBadge'

// ------------------------------------------------------------------ 注册

registerTab({ id: 'files', title: '文件', glyph: '🗀', source: 'builtin', multi: false, badge: NoBadge, render: FilesTab })
registerTab({ id: 'preview', title: '预览', glyph: '📄', source: 'builtin', multi: false, badge: PreviewBadge, render: PreviewTab })
registerTab({ id: 'terminal', title: '终端', glyph: '>_', source: 'builtin', multi: true, badge: TerminalBadge, render: TerminalTab })
registerTab({ id: 'skills', title: '技能', glyph: '✦', source: 'builtin', multi: false, badge: SkillsBadge, render: SkillsTab })
registerTab({ id: 'mcp', title: 'MCP', glyph: '⇄', source: 'builtin', multi: false, badge: McpBadge, render: McpTab })
registerTab({ id: 'plan', title: '计划', glyph: '☰', source: 'builtin', multi: false, badge: NoBadge, render: PlanDocTab })
registerTab({ id: 'permissions', title: '权限', glyph: '⛨', source: 'builtin', multi: false, badge: PermissionsBadge, render: PermissionsTab })

registerTab({
  id: 'subagent',
  title: '子代理',
  glyph: '⑂',
  source: 'builtin',
  multi: false,
  badge: NoBadge,
  render: SubagentReadonlyTab,
})

registerTab({
  id: 'team',
  title: '团队',
  glyph: '⚑',
  source: 'builtin',
  multi: false,
  badge: NoBadge,
  render: TeamTab,
})

registerTab({
  id: 'attachments',
  title: '附件',
  glyph: '🖼',
  source: 'builtin',
  multi: false,
  badge: NoBadge,
  render: AttachmentGallery,
})

registerTab({
  id: 'review',
  title: '复核',
  glyph: '⛨',
  source: 'builtin',
  multi: false,
  badge: NoBadge,
  render: ReviewQueueTab,
})

registerTab({ id: 'context', title: '上下文', glyph: '◔', source: 'builtin', multi: false, badge: ContextBadge, render: ContextTab })

/** guide 页与 + 菜单的展示顺序（不是注册顺序——用户按"最常看"排）。 */
export const BUILTIN_TAB_ORDER: DockTabId[] = [
  'files',
  'preview',
  'terminal',
  'skills',
  'mcp',
  'team',
  'permissions',
  'context',
]

export { TAB_BADGE }