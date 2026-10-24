import { useCallback, useEffect, useRef } from 'react'
import type { FileNode, SkillCandidate, TeamCandidate } from './TriggerManager'
import { observeComposition } from '../primitives/keyboardComposition'

export interface ComposerKeysOptions {
  /**
   * 状态机的按键处理。返回非 null 表示它已消费该键。
   *
   * 返回类型宽成 `unknown`：这里只做 `!== null` 的二值判断，具体返回什么
   * 由状态机自己定义，跟着它改类型只会让本文件跟着抖。
   */
  handle: (key: string, text: string, caret: number, files: FileNode[], skills: SkillCandidate[], teams: TeamCandidate[]) => unknown
  text: string
  files: FileNode[]
  /** codex 技能清单：`/` 弹层的「技能」分组候选。 */
  skills: SkillCandidate[]
  /** 注册表团队清单：`@` 弹层的「团队」分组候选。 */
  teams: TeamCandidate[]
  /** `Enter` 发送 还是 `Ctrl+Enter` 发送（设置中心「通用」域，08 §3.4）。 */
  enterSends: boolean
  onSubmit: () => void
  onTriggerHandled: () => void
}

/**
 * 输入框的按键处理。
 *
 * 两件事，优先级不能反：**候选面板开着时先给它**（此时 Enter 是「选中
 * 候选」而不是「发送」），面板没开才轮到发送快捷键。
 *
 * `handle` 必须**始终**被调用（即使弹层还没开）：触发符状态机就是在
 * idle 里识别「刚打了 `/` 或 `@`」从而打开弹层的。返回非 null 才代表
 * 这个键被弹层消费。
 *
  * 输入法的守卫是 dsh 的 `observeComposition`：`isComposing` 之外还覆盖
  * 组合结束后**迟到的** keydown 与 keyCode 229（部分引擎不用 isComposing），
  * 否则确认候选词的回车会把打了一半的消息发出去。
  */
export function useComposerKeys(o: ComposerKeysOptions) {
  const { handle, text, files, skills, teams, enterSends, onSubmit, onTriggerHandled } = o

  const compositionRef = useRef<ReturnType<typeof observeComposition> | null>(null)
  useEffect(() => {
    const composition = observeComposition(document)
    compositionRef.current = composition
    return () => {
      compositionRef.current = null
      composition.dispose()
    }
  }, [])

  return useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // IME 组合中的按键——包括确认候选的回车、组合结束后迟到的 keydown、
      // 部分引擎的 229——**全部交回输入法**：弹层不消费、发送也不拦。
      const composing =
        e.nativeEvent.isComposing || (compositionRef.current?.guards(e.nativeEvent) ?? false)
      if (composing) return

      const next = handle(e.key, text, e.currentTarget.selectionStart, files, skills, teams)
      if (next !== null) {
        e.preventDefault()
        onTriggerHandled()
        return
      }

      const wantsSend = enterSends
        ? e.key === 'Enter' && !e.shiftKey
        : e.key === 'Enter' && (e.ctrlKey || e.metaKey)
      if (wantsSend) {
        e.preventDefault()
        onSubmit()
      }
    },
    [handle, text, files, skills, teams, enterSends, onSubmit, onTriggerHandled],
  )
}
