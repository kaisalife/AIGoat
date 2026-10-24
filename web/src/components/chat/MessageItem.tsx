import { memo } from 'react'
import { ApprovalCard } from '../cards/ApprovalCard'
import { CompactionCard } from '../context/CompactionCard'
import { ElicitationCard, UserInputCard } from '../cards/UserInputCard'
import { ClientToolCard } from '../cards/ClientToolCard'
import { ImageGenerationCard, ImageViewCard } from '../cards/ImageCards'
import { RawDiff } from '../cards/DiffView'
import {
  SubAgentBadge,
  ToolCardRouter,
  TurnDiffCard,
} from '../cards'
import { MarkdownText } from '../primitives'
import { MessageActions } from './MessageActions'
import { ReasoningRow } from './ReasoningRow'
import { useLayoutStore } from '../layout/useLayoutStore'
import type { DetailLevel } from '../../store/ui'
import type { Entry } from '../../store/entries'

export interface MessageItemProps {
  entry: Entry
  detailLevel: DetailLevel
  onApprove: (requestId: unknown) => void
  onDecline: (requestId: unknown) => void
  /** 应答 `item/tool/requestUserInput`。 */
  onUserInput?: (requestId: unknown, answers: Record<string, string>) => void
  /** 应答 `mcpServer/elicitation/request`。 */
  onElicitation?: (requestId: unknown, content: unknown) => void
/** 打开子 Agent 只读面板（09 号板块）。 */
  onSubAgent?: (threadId: string) => void
}

/**
 * 一条消息。按 kind 分派到具体卡片。
 *
 * 用户消息与助手正文走排版样式；其余交给卡片层（05 板块）。
 * 这个 switch 必须穷举：新增条目种类时这里编译不过，逼着决定它长什么样。
 *
 * `memo`：未变的条目对象由 reducer 原样复用，配合上面按回合的块复用，
 * 只有真正变化的那条（通常是正在流式的正文）会重渲染。
 */
export const MessageItem = memo(function MessageItem(props: MessageItemProps) {
  const { entry, detailLevel, onApprove, onDecline, onSubAgent } = props
  const onUserInput = props.onUserInput ?? noop
  const onElicitation = props.onElicitation ?? noop

  switch (entry.kind) {
    case 'user':
      return (
        <article className="msg msg--user" data-entry-id={entry.id}>
          <header className="msg__head">
            <span className="msg__who">你</span>
            {/* 待确认：已发出但服务端还没确认。弱提示，不遮挡正文。 */}
            {entry.pending && <span className="msg__badge">发送中</span>}
            <MessageActions text={entry.text} />
          </header>
          <div className="msg__body selectable">{entry.text}</div>
        </article>
      )

    case 'assistant':
      return (
        <article className="msg msg--assistant" data-entry-id={entry.id}>
          <header className="msg__head">
            <span className="msg__who">Agent</span>
            {entry.streaming && <span className="msg__badge">输出中</span>}
            {/* 流式期间正文每帧都在变，复制到半截没意义——定稿后才给复制。 */}
            {!entry.streaming && <MessageActions text={entry.text} />}
          </header>
          <div className="msg__body">
            <MarkdownText text={entry.text} streaming={entry.streaming} />
          </div>
        </article>
      )

    case 'reasoning':
      return <ReasoningRow entry={entry} />

    case 'approval':
      return <ApprovalCard entry={entry} onApprove={onApprove} onDecline={onDecline} />

    case 'userInput':
      return <UserInputCard entry={entry} onSubmit={(answers) => onUserInput(entry.requestId, answers)} />

    case 'elicitation':
      return (
        <ElicitationCard entry={entry} onSubmit={(content) => onElicitation(entry.requestId, content)} />
      )

    case 'toolCall':
      return <ClientToolCard entry={entry} />

case 'subAgent':
      // 点徽章 → 打开**只读 tab**，不再切走当前会话（09 号板块 §4.2）。
      // 切走会打断正在跑的回合，而用户只是想"看一眼那边在干什么"。
      return <SubAgentBadge entry={entry} onOpen={onSubAgent} />

    case 'diff':
      return <TurnDiffCard diff={entry.diff} entryId={entry.id} />

    case 'imageView':
      return <ImageViewCard entry={entry} />

    case 'imageGeneration':
      return <ImageGenerationCard entry={entry} />

    case 'notice':
      return (
        <div className={'notice notice--' + entry.level} data-entry-id={entry.id}>
          <span className="notice__dot" aria-hidden="true" />
          <span className="selectable">{entry.text}</span>
        </div>
      )

    case 'compaction':
      return (
        <CompactionCard
          running={entry.running}
          byUser={entry.byUser}
          summarizedCount={entry.summarizedCount ?? null}
          onInspect={() => useLayoutStore.getState().setMainView('trajectory')}
        />
      )

    case 'reviewMode':
      return (
        <div className="divider divider--review" data-entry-id={entry.id}>
          <span className="divider__line" />
          <span className="divider__label">
            {entry.mode === 'entered' ? '进入复核' : '退出复核'} · {entry.review}
          </span>
          <span className="divider__line" />
        </div>
      )

    case 'divider':
      return (
        <div className="divider" data-entry-id={entry.id}>
          <span className="divider__line" />
          <span className="divider__label">{entry.label}</span>
          <span className="divider__line" />
        </div>
      )

    // 以下走卡片层；展开与否由它按 detailLevel 自己判断
    case 'tool':
    case 'fileEdit':
    case 'functionOutput':
      return <ToolCardRouter entry={entry} detailLevel={detailLevel} />

    default:
      // 未知条目类型：静默忽略，不渲染任何占位。
      return null
  }
})

/** 回合内 diff 的旧入口（plan-diff 的消息流还在用）。 */
export { RawDiff }

/** 提问类条目的回调没接上时的占位：点了没反应好过崩在事件处理器里。 */
function noop(): void {
  /* 故意不做任何事：调用方没提供应答通道 */
}