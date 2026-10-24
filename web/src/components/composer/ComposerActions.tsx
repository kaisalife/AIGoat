import cs from './Composer.module.css'

export interface ComposerActionsProps {
  /** 回合运行中。 */
  busy: boolean
  /** 运行中且 steer 可用：此时「发送」的语义是追加指令。 */
  canSteer: boolean
  /** 当前有可发送的内容（空文本时按钮置灰）。 */
  hasText: boolean
  onSend: () => void
  onStop: () => void
}

/**
 * 输入区右下角的提交按钮组。
 *
 * 单独成组件是因为这里有**三态**，而三态挤在 Composer 的 JSX 里时最容易
 * 漏掉其中一支——之前就漏过：busy 时只渲染「停止」，steer 因此完全没有
 * 入口，而输入框还被 `disabled={busy || blocked}` 一起禁掉，整条追加指令
 * 的链路在界面上是不存在的。
 *
 * 判定放在最前面，且**穷举** busy/canSteer：新增一种运行态时这里会明显
 * 少一支，而不是悄悄走到 else 去。
 */
export function ComposerActions(p: ComposerActionsProps) {
  const { busy, canSteer, hasText, onSend, onStop } = p

  if (busy) {
    return (
      <>
        {/* 运行中仍然要给「发出去」的入口：这才是 steer 的入口。
            语义与「停止」并列而不是互斥——追加不打断当前回合。 */}
        {canSteer && (
          <button
            className={cs.steerBtn}
            onClick={onSend}
            disabled={!hasText}
            title="追加到当前回合，模型会在下一个决策点读到"
          >
            追加指令
          </button>
        )}
        <button className={cs.stop} onClick={onStop}>
          停止
        </button>
      </>
    )
  }

  return (
    <button className={cs.send} onClick={onSend} disabled={!hasText}>
      发送
    </button>
  )
}
