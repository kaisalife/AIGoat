import type { ApprovalEntry } from '../../store/entries'

const KIND_LABEL: Record<string, string> = {
  commandExecution: '执行命令',
  fileChange: '修改文件',
  permissions: '提升权限',
  userInput: '补充输入',
  elicitation: '外部服务请求',
  other: '需要确认',
}

export interface ApprovalCardProps {
  entry: ApprovalEntry
  onApprove: (requestId: unknown) => void
  onDecline: (requestId: unknown) => void
}

/**
 * 审批卡片。
 *
 * 设计上它是消息流里**唯一**带实心按钮的元素——因为它是唯一会阻塞用户的
 * 东西。已处理的卡片收敛成一行灰字，不留在视觉焦点上。
 */
export function ApprovalCard(props: ApprovalCardProps) {
  const { entry, onApprove, onDecline } = props
  const pending = entry.state === 'pending'

  if (!pending) {
    return (
      <div className="approval approval--done">
        <span className="approval__glyph" aria-hidden="true">
          {entry.state === 'approved' ? '✓' : '⊘'}
        </span>
        <span>{KIND_LABEL[entry.approvalKind] ?? '需要确认'}</span>
        <span className="approval__verdict">{entry.decision}</span>
        {entry.command && <code className="approval__cmd truncate">{entry.command}</code>}
      </div>
    )
  }

  return (
    <div className="approval approval--pending" role="alertdialog" aria-label="需要审批">
      <header className="approval__head">
        <span className="approval__glyph" aria-hidden="true">
          !
        </span>
        <span className="approval__kind">
          {KIND_LABEL[entry.approvalKind] ?? '需要确认'}
        </span>
        {entry.cwd && <code className="approval__cwd truncate">{entry.cwd}</code>}
      </header>

      {entry.command && <pre className="approval__cmd selectable">{entry.command}</pre>}

      {entry.reason && <p className="approval__reason">{entry.reason}</p>}

      <div className="approval__actions">
        <button className="btn btn--primary" onClick={() => onApprove(entry.requestId)}>
          允许
        </button>
        <button className="btn btn--danger" onClick={() => onDecline(entry.requestId)}>
          拒绝
        </button>
      </div>
    </div>
  )
}
