import { useCallback, useEffect, useRef, useState } from 'react'
import { ContextBreakdown } from '../context/ContextBreakdown'
import { ContextMeter } from '../context/ContextMeter'
import { ModelSeat } from '../model/ModelSeat'
import { ApprovalModeSwitch } from './ApprovalModeSwitch'
import { TriggerPopup } from './TriggerPopup'
import {
  applySelection,
  createTriggerMachine,
  itemsFor,
  triggerSpan,
  type FileNode,
  type PopupItem,
} from './TriggerManager'
import { dispatchCommandLine } from './useComposerSubmit'
import { ComposerActions } from './ComposerActions'
import { useComposerKeys } from './useComposerKeys'
import cs from './Composer.module.css'

export interface ComposerProps {
  busy: boolean
  /** 有待审批/提问时禁用输入。 */
  blocked: boolean
  /** 上下文占用：used / limit（0 = 模型目录没填）与明细。 */
  tokensUsed: number
  contextLimit: number
  tokens: { input: number; cached: number; output: number; reasoning: number }
  /** `Enter` 发送 还是 `Ctrl+Enter` 发送（设置中心「通用」域，08 §3.4）。 */
  enterSends: boolean
  /** 回合运行中：发送走 steer 而不是新回合。 */
  steer: boolean
  /** `@file` 的候选来源（工作区文件列表）。 */
  files: FileNode[]
  /** 受控草稿。提到槽里是为了审批接管期间 composer 被换掉时草稿不丢。 */
  draft: string
  onDraftChange: (text: string) => void
  onSend: (text: string) => void
  onStop: () => void
}

/**
 * 输入区。固定在底部而不是跟着消息流滚动：长会话里不该为了打字翻到最底。
 *
 * 三件事在这里（细节见各自的模块）：触发管线（08 §3.2 的三态状态机）、
 * 命令派发（`execute` 类命令提交时本地执行）、steer 模式（运行中走 steer）。
 *
 * 环形上下文占用嵌在 box 的下缘（13 号板块）：它恰恰是发消息**之前**
 * 最该看到的信息，放到消息流顶部会随滚动跑出视野。
 */
export function Composer(props: ComposerProps) {
  const {
    busy,
    blocked,
    tokensUsed,
    contextLimit,
    tokens,
    enterSends,
    steer,
    files,
    draft,
    onDraftChange,
    onSend,
    onStop,
  } = props

  // 草稿受控（12 号板块）：审批接管期间这个组件整个被换掉，草稿留在槽里
  const text = draft
  const setText = onDraftChange
  const [showUsage, setShowUsage] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  // 状态机是可变的（用 getter 暴露内部），放 ref 里避免每次渲染重建。
  const machine = useRef(createTriggerMachine()).current
  const [, force] = useState(0)

  // 自适应高度：随内容长高，但不超过上限后转为内部滚动。
  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [text])

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed || blocked) return
    // 命令优先：它可能在本地做完事，那就什么都不该发。
    if (dispatchCommandLine(trimmed)) {
      setText('')
      machine.reset()
      force((n) => n + 1)
      return
    }
    onSend(trimmed)
    setText('')
  }

  // 只有 blocked（审批/提问未决）才禁用输入。**busy 不禁用**——回合跑着时
  // 要能打字追加指令。之前把 busy 也算进去，输入框整个变灰、发送键只剩
  // 「停止」，steer 在界面上根本不存在。
  const disabled = blocked
  const canSteer = busy && steer
  const bump = useCallback(() => force((n) => n + 1), [])
  const onKeyDownBase = useComposerKeys({
    handle: machine.handle,
    text,
    files,
    enterSends,
    onSubmit: submit,
    onTriggerHandled: bump,
  })

  const pick = (item: PopupItem) => {
    const span = triggerSpan(text, area.current?.selectionStart ?? text.length)
    const next = applySelection(text, span, item)
    setText(next.text)
    machine.reset()
    // 光标移到插入片段之后，用户可以接着打字。
    requestAnimationFrame(() => {
      const el = area.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
    })
    force((n) => n + 1)
  }

  // 状态机在 Enter/Tab 时进入 `selected`，但它不负责替换文本——替换需要
  // 输入框光标位置，那是组件的事。这里在按键处理之后补上：弹层里回车选中的
  // 候选必须真的落进输入框，否则键盘操作等于没反应。
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDownBase(e)
    if (machine.state.phase === 'selected') {
      pick(machine.state.item)
    }
  }

  return (
    <div className={cs.composer}>
      {blocked && (
        <div className={cs.blocked}>有一条审批请求待处理，处理后才能继续发送。</div>
      )}

      <div className={cs.box} data-disabled={disabled || undefined}>
        {machine.open && (
          <TriggerPopup
            items={itemsFor(machine.state, files)}
            cursor={machine.cursor}
            onPick={pick}
            onDismiss={() => {
              machine.reset()
              force((n) => n + 1)
            }}
            signal={text.length}
          />
        )}

        <textarea
          ref={area}
          className={cs.input}
          placeholder={
            canSteer
              ? '追加指令（Enter 发送到当前回合）'
              : busy
                ? 'Agent 正在处理…'
                : blocked
                  ? '等待审批…'
                  : '输入消息。/ 调命令，@ 引用文件'
          }
          value={text}
          disabled={disabled}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className={cs.bar}>
          <ContextMeter
            used={tokensUsed}
            limit={contextLimit}
            onClick={() => setShowUsage(!showUsage)}
          />
          <span className={cs.hint}>
            <kbd>{enterSends ? 'Enter' : 'Ctrl+Enter'}</kbd> 发送 ·{' '}
            <kbd>{enterSends ? 'Shift+Enter' : 'Enter'}</kbd> 换行
          </span>
          <span className="spacer" />
          <ApprovalModeSwitch />
          <ModelSeat running={busy} />

          <ComposerActions
            busy={busy}
            canSteer={canSteer}
            hasText={!!text.trim()}
            onSend={submit}
            onStop={onStop}
          />
        </div>
      </div>

      {showUsage && (
        <ContextBreakdown
          input={tokens.input}
          cached={tokens.cached}
          output={tokens.output}
          reasoning={tokens.reasoning}
          limit={contextLimit}
          onClose={() => setShowUsage(false)}
        />
      )}
    </div>
  )
}