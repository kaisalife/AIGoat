import clsx from 'clsx'
import { LineageBreadcrumb } from '../subagent/LineageBreadcrumb'
import { DetailSwitch } from './DetailSwitch'
import { ViewSwitch } from './ViewSwitch'
import s from './ConversationHeader.module.css'

export interface ConversationHeaderProps {
  /** 当前会话标题（协议里的 preview）。没有会话时为空串。 */
  title: string
  /** 右侧插槽：令牌余量、模型名等随会话变化的信息。 */
  aside?: React.ReactNode
}

/**
 * 会话头部：标题 + 视图环。
 *
 * 只放「这个会话的身份」和「怎么看它」。工作区、模型、连接状态都属于
 * 全局，都在顶栏——这条线划清楚，切换会话时头部才不会整行闪。
 */
export function ConversationHeader({ title, aside }: ConversationHeaderProps) {
  return (
    <header className={s.header}>
      <h1 className={clsx(s.title, !title && s.untitled)}>{title || '未命名会话'}</h1>
      {/* 有子代理时才出现（09 号板块）：没有子代理的会话是最常见情况，
          常驻一个「子代理：无」纯属噪音。 */}
      <LineageBreadcrumb />
      <span className={s.spacer} />
      {aside}
      <DetailSwitch />
      <ViewSwitch />
    </header>
  )
}