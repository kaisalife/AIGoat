import { Button } from '../primitives'
import type { CompactionNoticeEntry } from '../../store/entries'
import s from './CompactionNotice.module.css'

export interface CompactionNoticeProps {
  /** 最新一条未 dismissed 的压缩提示；null = 不显示。 */
  notice: CompactionNoticeEntry | null
  onDismiss: (id: string) => void
  /** 跳到 Trajectory 看压缩前后发生了什么。 */
  onInspect: () => void
}

/**
 * 压缩常驻提示条（13 号板块 §3.2）。
 *
 * # 为什么卡之外还要它
 *
 * 卡在消息流里，**滚上去就看不见了**。而压缩是不可逆的信息损失——
 * 用户几轮之后才发现"它怎么不记得我说的那个文件"，代价已经造成了。
 * 所以提示条常驻输入区上方，影响还在就在。
 *
 * # 自动压缩要额外说明「这不是你干的」
 *
 * 否则用户会怀疑自己手滑点了什么。
 */
export function CompactionNotice({ notice, onDismiss, onInspect }: CompactionNoticeProps) {
  if (!notice || notice.dismissed) return null

  return (
    <div className={s.bar} role="status">
      <span className={s.icon} aria-hidden="true">
        ⤵
      </span>
      <span className={s.text}>
        {notice.byUser ? '上下文已压缩' : 'codex 自动压缩了上下文（不是你的操作）'}
        {notice.summarizedCount !== null && ` · 摘要了 ${notice.summarizedCount} 条更早消息`}
        ，模型之后看不到其中的细节。
      </span>
      <span className="spacer" />
      <button type="button" className={s.link} onClick={onInspect}>
        查看记录
      </button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDismiss(notice.id)}
        title="本次会话不再提示（压缩本身不可逆）"
      >
        知道了
      </Button>
    </div>
  )
}