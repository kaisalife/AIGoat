/**
 * 会话行的小组件（状态点 / 菜单项 / 时间戳）。
 *
 * 拆出来是因为 `ThreadRow.tsx` 里真正的交互只有"点哪一下做什么"，
 * 而这三个小组件占了近一半篇幅——放在同一个文件里读的人要在一堆
 * presentational 标记里找那两行事件绑定。
 */

import type { ThreadStatusPayload } from '../../bridge/types'
import s from './ThreadRow.module.css'

/**
 * 运行状态点。
 *
 * 协议给了 `activeFlags`（"正在执行命令 / 等审批 / 正在 compact…"），
 * tooltip 直接用它——用户看到转圈时最想知道的是"卡在哪一步"。
 */
export function StatusDot({ status }: { status?: ThreadStatusPayload }) {
  const running = status?.type === 'active'
  const failed = status?.type === 'systemError'
  const title = statusTitle({ status })
  return (
    <span
      className={`${s.dot} ${running ? s.dotRun : failed ? s.dotErr : ''}`}
      title={title}
      aria-label={title}
    />
  )
}

/** 状态 → 一句话（`undefined` 表示没什么可说的）。 */
export function statusTitle(thread: { status?: ThreadStatusPayload }): string | undefined {
  switch (thread.status?.type) {
    case 'active': {
      const flags = thread.status.activeFlags ?? []
      return flags.length > 0 ? `运行中：${flags.join('、')}` : '运行中'
    }
    case 'systemError':
      return '上次运行出错'
    default:
      return undefined
  }
}

export function MenuItem(props: {
  label: string
  danger?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      role="menuitem"
      className={props.danger ? 'menu__item menu__item--danger' : 'menu__item'}
      title={props.title}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}

export function stamp(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
