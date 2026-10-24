import { useEffect, useState } from 'react'
import { Button, Modal } from '../primitives'
import { getClient } from '../../bridge/session'
import { useShell } from '../../store/shell'
import s from './GoalBubble.module.css'

export interface GoalBubbleProps {
  open: boolean
  onClose: () => void
  /** `/goal 文本` 带来的初始文本；空则用现有目标。 */
  initialText?: string
}

/**
 * 目标气泡（07 号板块，抄 dsh 的 `/goal` 气泡）。
 *
 * # 为什么是模态而不是行内编辑
 *
 * 设目标是一个"停下来想一下"的动作，不该在打字中途打断；而且目标文本
 * 可能要写好几行，输入框放不下。
 *
 * 预设了几个常用目标的起点——它们不是模板，是**降低起步成本**：
 * 空着让用户自己想"目标"这个词该写多具体。
 */
export function GoalBubble(props: GoalBubbleProps) {
  const { open, onClose, initialText } = props
  const threadId = useShell((s) => s.activeThreadId)
  const goal = useShell((s) => s.goal)
  const loadGoal = useShell((s) => s.loadGoal)

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 打开时取初值：命令带来的文本 > 现有目标 > 空。
  // 初值必须写进 state：seed 之前只用来给 Modal 换 key（重挂的是 Modal 的
  // 内部节点，textarea 的 value 仍由本组件的 state 驱动），结果「编辑目标」
  // 打开的永远是空框，一提交就把原目标覆盖没了。
  useEffect(() => {
    if (open) setText(initialText ?? goal?.objective ?? '')
    // 只在打开瞬间取初值；编辑过程中 goal 变化不该覆盖正在输入的内容。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async () => {
    const trimmed = text.trim()
    if (!threadId || !trimmed) return
    setBusy(true)
    setError(null)
    try {
      await getClient().goalSet(threadId, { objective: trimmed, status: 'active' })
      await loadGoal()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="narrow"
      title="设置目标"
      description="给这一轮一个可核查的目标。设置后模型会持续朝它推进，中途可以暂停。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            loading={busy}
            disabled={!text.trim() || !threadId}
          >
            开始
          </Button>
        </>
      }
    >
      {error && <p className={s.error}>{error}</p>}

      <textarea
        className={s.input}
        value={text}
        autoFocus
        placeholder="例如：把这个页面的首屏时间压到 200ms 以内，并保持现有测试通过"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter 提交：多行文本里裸 Enter 是换行不是提交
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void submit()
          }
        }}
      />

      <div className={s.presets}>
        <span className={s.presetsLabel}>起步示例</span>
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={s.preset}
            onClick={() => setText(preset)}
          >
            {preset}
          </button>
        ))}
      </div>

      <p className={s.note}>
        目标会随 <code>thread/goal/set</code> 提交，压缩上下文不会把它丢掉。
      </p>
    </Modal>
  )
}

const PRESETS = [
  '把这个问题查清楚并给出结论，不要先改代码',
  '只做诊断：列出可疑点与验证步骤，等我确认',
  '修好这个失败，并让相关测试变绿',
]