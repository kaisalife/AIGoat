/**
 * 四个只读资源 tab 共用的小组件与色标。
 *
 * 从 `Panels.tsx` 拆出时重写了一遍结构：原来是一堆 `.panel__row` 的裸 div，
 * 现在统一成「节 + 行 + 徽标」，四个 tab 看起来是一套东西。
 */

import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Pill, Spinner, StateDot, type PillTone, type StateDotTone } from '../primitives'
import s from './ResourceTabs.module.css'

/** 一节：标题 + 计数 + 右侧动作。 */
export function Section(props: {
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={s.section}>
      <header className={s.sectionHead}>
        <h3>
          {props.title}
          {props.count !== undefined && <span className={s.count}>{props.count}</span>}
        </h3>
        {props.action}
      </header>
      {props.children}
    </section>
  )
}

/** 空数据占位。统一成虚线框，四个 tab 看起来是一套。 */
export function Empty({ text }: { text: string }) {
  return <p className={s.empty}>{text}</p>
}

/** 缺省状态：没法区分"没有"和"读不到"时，统统说成没有（读不到会另外进 error）。 */
export function EmptyHint({ text }: { text: string }) {
  return <p className={s.hint}>{text}</p>
}

export function Centered({ children }: { children: ReactNode }) {
  return <div className={s.center}>{children}</div>
}

export function List({ children }: { children: ReactNode }) {
  return <ul className={s.list}>{children}</ul>
}

export function Row({
  children,
  off,
}: {
  children: ReactNode
  /** 不可用 / 停用：置灰而不是隐藏——隐藏会让人以为功能不存在。 */
  off?: boolean
}) {
  return (
    <li className={clsx(s.row, off && s.off)}>
      {children}
    </li>
  )
}

export function Name({ children, code }: { children: ReactNode; code?: boolean }) {
  return <span className={code ? s.codeName : s.name}>{children}</span>
}

export function CodeName({ children }: { children: ReactNode }) {
  return <code className={s.codeName}>{children}</code>
}

export function Desc({ children }: { children: ReactNode }) {
  return <span className={s.desc}>{children}</span>
}

export function Meta({ children }: { children: ReactNode }) {
  return <span className={s.meta}>{children}</span>
}

export function Dot({ tone, busy }: { tone: StateDotTone; busy?: boolean }) {
  return <StateDot tone={tone} busy={busy} size={6} />
}

export function Badge({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <Pill tone={tone}>{children}</Pill>
}

export function Spinner_() {
  return <Spinner />
}

/** MCP 状态 → 语义色/文案。runtime 与 auth 两套状态合成一个结论。 */
export function mcpTone(runtime: string | null | undefined, auth: string): StateDotTone {
  if (runtime === 'connected' && auth !== 'notLoggedIn') return 'success'
  if (runtime === 'authenticationRequired' || auth === 'notLoggedIn') return 'warning'
  if (runtime === 'failed') return 'danger'
  return 'neutral'
}

export function mcpAuthLabel(auth: string): string {
  switch (auth) {
    case 'bearerToken':
      return '令牌'
    case 'oAuth':
      return 'OAuth'
    case 'notLoggedIn':
      return '未登录'
    case 'unsupported':
      return '无需认证'
    default:
      return '未知'
  }
}

/**
 * 沙箱三态。
 *
 * `updateRequired` 刻意单列：它和"没装"修法完全不同，合并显示会让用户
 * 以为重装一下就能解决，而实际需要的是更新——所以它的色也提一级（danger）。
 */
export function sandboxDot(status: string | undefined): StateDotTone {
  if (status === 'ready') return 'success'
  return status === 'updateRequired' ? 'danger' : 'warning'
}

export function sandboxPill(status: string | undefined): PillTone {
  if (status === 'ready') return 'success'
  return status === 'updateRequired' ? 'danger' : 'warning'
}

export function sandboxLabel(status: string | undefined): string {
  switch (status) {
    case 'ready':
      return '就绪'
    case 'notConfigured':
      return '未配置'
    case 'updateRequired':
      return '需更新'
    default:
      return '未知'
  }
}

export function sandboxHint(status: string | undefined): string {
  switch (status) {
    case 'ready':
      return '命令在隔离环境里执行。'
    case 'notConfigured':
      return '沙箱未配置，命令可能不受隔离。'
    case 'updateRequired':
      return '沙箱组件版本过期，需要更新后才能继续隔离。'
    default:
      return '沙箱状态未知。'
  }
}