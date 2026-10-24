/**
 * 复制成功反馈（移植自 dsh `ui-primitives/use-copy-feedback.ts`）。
 */
import { useCallback, useState } from 'react'
import { writeClipboard } from './clipboard'

/** 写入成功后 `copied` 保持 true 的时长（ms）。 */
const COPIED_FEEDBACK_MS = 1000

/** 复制反馈 hook 的返回：瞬态标记与复制处理器。 */
export interface CopyFeedback {
  /** 写入成功后 {@link COPIED_FEEDBACK_MS} 内为 true；成功态文案看它。 */
  copied: boolean
  /** 复制 hook 持有的文本；`copied` 期间是 no-op，写入被拒时静默。 */
  onCopy: () => void
}

/**
 * 把 `text` 复制到剪贴板，带一秒成功反馈。
 * @param text - 复制时写入的文本。
 * @returns `copied` 标记与 `onCopy` 处理器。
 */
export function useCopyFeedback(text: string): CopyFeedback {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(() => {
    if (copied) return
    void writeClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => { setCopied(false) }, COPIED_FEEDBACK_MS)
    })
  }, [copied, text])
  return { copied, onCopy }
}
