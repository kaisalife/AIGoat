import { useCopyFeedback } from '../primitives'

/**
 * 消息级操作（移植 dsh `MessageIconActions` 的「复制」一项）。
 *
 * 每条用户 / 助手消息**悬停时**在头部右侧浮现一个「复制」。这是消息流里
 * 最高频的轻操作：想引用模型刚说的一段话，直接复制，不必手动框选。
 *
 * dsh 那一行还有「在此消息处**分叉**」（从这条消息岔出新会话）。AIGoat 的
 * 分叉是**会话级**（`thread/fork` 复制整条历史），没有"从某条消息分叉"的
 * 协议语义，所以**只移植复制**——宁可少一个入口，也不给一个点了语义不对的
 * 按钮（那比没有更糟）。
 *
 * 复用 `useCopyFeedback`：写入成功后短暂显示「已复制」，期间再点不叠加。
 */
export function MessageActions({ text }: { text: string }) {
  const { copied, onCopy } = useCopyFeedback(text)

  return (
    <div className="msg__actions">
      <button
        type="button"
        className="msg__action"
        onClick={onCopy}
        aria-label={copied ? '已复制' : '复制消息'}
        title={copied ? '已复制' : '复制消息'}
      >
        {copied ? '✓ 已复制' : '复制'}
      </button>
    </div>
  )
}
