import { ComposerSlot } from '../composer/ComposerSlot'
import { ConversationHeader } from './ConversationHeader'
import { PlanPanel } from './PlanPanel'
import { ConversationStream } from './ConversationStream'
import { useShell } from '../../store/shell'

/**
 * 会话视图：中栏的默认投影。
 *
 * 结构（自上而下）：头部 → 计划面板 → 消息流 → 输入区。
 * 消息流是唯一自己滚动的块，头部与输入区固定——这是消息流拥有滚动所有权的
 * 前提（04 §3.2）。
 *
 * # 为什么自己订阅而不是收 `shell` 整店
 *
 * 之前由 `CenterSlot` 整店订阅后把 `shell` 传进来，于是中栏整棵子树在**每条
 * 流式 delta、每次 token 更新**上重渲染——长会话里这是最明显的卡顿来源。
 * 这里改成逐字段订阅：只有真正用到的切片变了才重渲染。标题选择器返回字符串、
 * 计划返回对象引用，二者在流式期间都不变，所以中栏顶部不会跟着每个 delta 抖。
 */
export function ChatView() {
  const title = useShell(
    (s) => s.threadList.find((t) => t.id === s.activeThreadId)?.preview ?? '',
  )
  const activeThreadId = useShell((s) => s.activeThreadId)
  const entries = useShell((s) => s.turn.entries)
  const turns = useShell((s) => s.turn.turns)
  const turnActive = useShell((s) => s.turn.turnActive)
  const plan = useShell((s) => s.turn.plan)

  return (
    <>
      <ConversationHeader title={title} />
      <PlanPanel plan={plan} />
      <ConversationStream
        entries={entries}
        turns={turns}
        turnActive={turnActive}
        resetKey={activeThreadId}
      />
      <ComposerSlot />
    </>
  )
}
