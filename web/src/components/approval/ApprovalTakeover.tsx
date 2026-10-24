import { useEffect, useState, useCallback } from 'react'
import type { ApprovalEntry, Entry } from '../../store/entries'
import { useShell } from '../../store/shell'
import { ApprovalCard } from '../cards/ApprovalCard'
import { ElicitationCard, UserInputCard } from '../cards/UserInputCard'
import { dangerReason, isDangerousCommand } from './danger'
import s from './ApprovalTakeover.module.css'

export interface ApprovalTakeoverProps {
  approval: ApprovalEntry | null
  /** 待作答的提问（userInput 或 elicitation）；两者都不该同时出现。 */
  question: Extract<Entry, { kind: 'userInput' | 'elicitation' }> | null
}

/**
 * 审批接管（12 号板块 §3.1）。
 *
 * # 为什么是「接管 composer」而不是浮层卡片
 *
 * 审批期间用户**不能**继续干别的：模型在等一个决定，输入区留着会让他以为
 * 还能继续发消息（发出去也会被拒，因为存在竞态）。
 *
 * 取代而不是叠加还有一个理由：审批卡与输入框争夺同一块注意力，两个都在
 * 抢；只留一个，视线就不用选了。
 *
 * # 快捷键
 *
 * - `Enter` 批准 / `Esc` 拒绝 —— 普通命令
 * - `Shift+Enter` 批准 —— **危险命令**（判定见 `danger.ts`）
 * - `Shift+D` 展开 / 收起详情
 *
 * 危险命令刻意不给裸 Enter：在审批框里按 Enter 的肌肉动作，和在确认
 * "真的要删掉整个项目"时按 Enter 的心理准备，是两件事。
 *
 * # 草稿不在这里管
 *
 * 草稿由 `ComposerSlot` 持有——它把 draft 提升到槽里、接管期间不卸载
 * composer 的状态。这里只负责"处理完把焦点还给输入框"（dsh 的焦点模型）。
 */
export function ApprovalTakeover(props: ApprovalTakeoverProps) {
  const { approval, question } = props
  const answer = useShell((s) => s.answerApproval)
  const answerUserInput = useShell((s) => s.answerUserInput)
  const answerElicitation = useShell((s) => s.answerElicitation)
  const [showDetail, setShowDetail] = useState(false)

  const approve = useCallback(() => {
    if (!approval) return
    void answer(approval.requestId, 'approve')
  }, [approval?.requestId, answer])
  const decline = useCallback(() => {
    if (!approval) return
    void answer(approval.requestId, 'decline')
  }, [approval?.requestId, answer])

  // 换了一条审批就收起详情：上一条的详情对这一条没有意义。
  useEffect(() => setShowDetail(false), [approval?.requestId])

  if (approval) {
    const dangerous = isDangerousCommand(approval.command, approval.cwd)

    return (
      <div className={s.takeover} data-danger={dangerous || undefined}>
        <div className={s.head}>
          <span className={s.kind}>{approval.approvalKind}</span>
          <span className={s.what}>需要你批准</span>
          {dangerous && (
            <span className={s.danger} title="请确认命令内容再批准">
              {dangerReason(approval.command)}
            </span>
          )}
          <span className="spacer" />
          <span className={s.keys}>
            <kbd>{dangerous ? 'Shift+Enter' : 'Enter'}</kbd> 批准 · <kbd>Esc</kbd> 拒绝 ·{' '}
            <kbd>Shift+D</kbd> 详情
          </span>
        </div>

        {/* 复用消息流里那张卡：审批的呈现只有一份，两处不一致会很难排查 */}
        <ApprovalCard
          entry={approval}
          onApprove={approve}
          onDecline={decline}
        />

        {showDetail && (
          <p className={s.detail}>
            {approval.reason ?? '（这条请求没有附带说明）'}
            {approval.cwd && (
              <>
                <br />
                工作目录：<code>{approval.cwd}</code>
              </>
            )}
          </p>
        )}
        <button type="button" className={s.toggle} onClick={() => setShowDetail(!showDetail)}>
          {showDetail ? '收起详情' : '展开详情'}
        </button>

        <ApprovalKeys
          dangerous={dangerous}
          onApprove={approve}
          onDecline={decline}
          onToggleDetail={() => setShowDetail((v) => !v)}
        />
      </div>
    )
  }

  if (!question) return null
  return (
    <div className={s.takeover}>
      {question.kind === 'userInput' ? (
        <UserInputCard
          entry={question}
          onSubmit={(answers) => void answerUserInput(question.requestId, answers)}
        />
      ) : (
        <ElicitationCard
          entry={question}
          onSubmit={(content) => void answerElicitation(question.requestId, content)}
        />
      )}
    </div>
  )
}

/**
 * 全局按键绑定。
 *
 * 挂在 window 上而不是这个 div：审批卡不是焦点目标，用户此时压根没在
 * 点任何东西，光标可能还留在别处（甚至在输入框里）。
 */
function ApprovalKeys({
  dangerous,
  onApprove,
  onDecline,
  onToggleDetail,
}: {
  dangerous: boolean
  onApprove: () => void
  onDecline: () => void
  /** Shift+D 展开/收起详情。之前这个绑定是空实现，还把 Shift+D 全局吞掉。 */
  onToggleDetail: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 输入框里正在打字时不抢键：否则用户打 "rm" 会被当成按 Esc。
      const el = document.activeElement
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onDecline()
      } else if (e.key === 'Enter' && e.shiftKey === dangerous) {
        // 普通命令要裸 Enter；危险命令要 Shift+Enter。写成相等判断，
        // 两种情况共用一行逻辑，改判定规则时只动 danger.ts 一处。
        e.preventDefault()
        onApprove()
      } else if (e.key.toLowerCase() === 'd' && e.shiftKey) {
        e.preventDefault()
        onToggleDetail()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dangerous, onApprove, onDecline, onToggleDetail])

  return null
}