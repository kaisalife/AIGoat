/**
 * 审批接管的启用判定（12 号板块 §3.1）。
 *
 * 单独成文件而不是让 `ComposerSlot` 直接问 store：判断条件有三条
 * （待审批 / 待提问 / 待 elicitation），它们要**互斥地**决定"接管谁"，
 * 写在一个 hook 里最容易在改的时候破坏优先级。
 */

import { useMemo, type ReactElement } from 'react'
import { ApprovalTakeover } from './ApprovalTakeover'
import { useShell } from '../../store/shell'
import type { Entry } from '../../store/entries'

/**
 * 返回要接管的界面；返回 null 表示用普通 composer。
 *
 * **审批优先于提问**：审批是模型在等一个"准不准"的决定，提问是模型在等
 * 内容。两件事同时存在时先处理审批——它通常更紧急，而且用户拒绝之后
 * 提问往往就不需要了。
 */
export function useApprovalTakeover(): ReactElement | null {
  const approval = useShell((s) => s.turn.pendingApproval)
  const entries = useShell((s) => s.turn.entries)

  const question = useMemo(() => lastPendingQuestion(entries), [entries])
  if (!approval && !question) return null

  return <ApprovalTakeover approval={approval} question={question} />
}

/** 最后一条未作答的提问（userInput 或 elicitation）。 */
export function lastPendingQuestion(
  entries: Entry[],
): Extract<Entry, { kind: 'userInput' | 'elicitation' }> | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e && (e.kind === 'userInput' || e.kind === 'elicitation') && e.state === 'pending') {
      return e
    }
  }
  return null
}