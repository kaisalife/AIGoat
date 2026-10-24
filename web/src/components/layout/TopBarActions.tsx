import type { ReactNode } from 'react'

export function Icon(props: { d: string; children?: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={props.d}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {props.children}
    </svg>
  )
}

export function Chip(props: {
  tone: 'ok' | 'warn' | 'danger' | 'neutral'
  title?: string
  children: ReactNode
}) {
  return (
    <span className={'chip chip--' + props.tone} title={props.title}>
      {props.children}
    </span>
  )
}

export function Dot(props: { tone: 'ok' | 'danger' }) {
  return <span className={'dot dot--' + props.tone} />
}

export interface TopBarActionsProps {
  connected: boolean
  userAgent: string
  pendingApprovals: number
  theme: 'dark' | 'light'
  /** 「文件」面板是否在前台。 */
  filesActive: boolean
  rightOpen: boolean
  onToggleTheme: () => void
  onToggleFiles: () => void
  onToggleRight: () => void
  onOpenResources: () => void
  onOpenSettings: () => void
}

/**
 * 顶栏右侧：连接状态、主题、三个面板开关。
 *
 * 单独成文件是因为它和左半边（品牌、工作区、模型）没有共享状态，
 * 只是碰巧都在一条栏里。图标路径也集中在这里——`Icon`/`Chip`/`Dot`
 * 三个小组件跟着它一起走，别处就不用重复画。
 *
 * 提示里的快捷键文案必须与 `layout/shortcuts.ts` 的注册表一致：
 * 写错键位比不写更糟，用户按了发现没用就会以为程序坏了。
 */
export function TopBarActions(props: TopBarActionsProps) {
  const {
    connected,
    userAgent,
    pendingApprovals,
    theme,
    filesActive,
    rightOpen,
    onToggleTheme,
    onToggleFiles,
    onToggleRight,
    onOpenResources,
    onOpenSettings,
  } = props

  return (
    <div className="topbar__right">
      {pendingApprovals > 0 && (
        <Chip tone="warn" title="有待处理的审批请求">
          审批 {pendingApprovals}
        </Chip>
      )}

      <Chip tone={connected ? 'ok' : 'danger'} title={connected ? userAgent : '未连接到 app-server'}>
        <Dot tone={connected ? 'ok' : 'danger'} />
        {connected ? '已连接' : '未连接'}
      </Chip>

      <button
        className="topbar__toggle"
        onClick={onToggleTheme}
        title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
        aria-label="切换主题"
      >
        {theme === 'dark' ? (
          <Icon d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
        ) : (
          <Icon d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        )}
      </button>

      <button
        className={'topbar__toggle' + (filesActive ? ' is-on' : '')}
        onClick={onToggleFiles}
        title="文件树（Ctrl+E）"
        aria-label="文件树"
      >
        <Icon d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </button>

      <button
        className="topbar__toggle"
        onClick={onOpenResources}
        title="技能与钩子（当前工作区）"
        aria-label="技能与钩子"
      >
        <Icon d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
      </button>

      <button
        className="topbar__toggle"
        onClick={onOpenSettings}
        title="设置（模型、子 Agent、偏好）"
        aria-label="打开设置"
      >
        <Icon d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </button>

      <button
        className={'topbar__toggle' + (rightOpen ? ' is-on' : '')}
        onClick={onToggleRight}
        title="切换检查器（Ctrl+J）"
        aria-label="切换检查器"
      >
        <Icon d="M3 4h18v16H3zM15 4v16" />
      </button>
    </div>
  )
}