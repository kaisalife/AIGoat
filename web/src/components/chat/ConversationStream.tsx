import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef, memo, lazy, Suspense } from 'react'
import TurnBlock from './TurnBlock'
import { TurnRail } from './TurnRail'
import { toggleDockTab } from '../dock/useDockStore'
import { useScrollOwnership } from '../../store/useScrollOwnership'
import { useTurnBlocks } from '../../store/grouping'
import { setWatchedThread } from '../../store/subagents'
import { useShell } from '../../store/shell'
import { useUi } from '../../store/ui'
import type { Entry } from '../../store/entries'
import type { TurnMeta } from '../../store/turnState'
import s from './ConversationStream.module.css'

// 账本是折叠的第二层（默认不展开），按需加载：它带轨迹表格/时间轴/时序窗口，
// 冷启动根本用不到。第 4 档（原始事件）下也只在打开时才拉。
const Ledger = lazy(() => import('./Ledger').then((m) => ({ default: m.Ledger })))

export interface ConversationStreamProps {
  entries: Entry[]
  turns: TurnMeta[]
  turnActive: boolean
  /** 切会话 / 换线程时变，用来重置滚动所有权。 */
  resetKey: string | null
  /**
   * 只读模式（子代理面板，09 号板块）。
   *
   * 差别不是「样式变灰」，而是**不接任何应答**：审批与提问条目直接从树上
   * 剔除。那个线程的请求由 `ingestForeign` 处理，这里再插一份会让两个
   * 界面抢同一个决定。
   */
  readonly?: boolean
}

/**
 * 会话视图的消息流（04 号板块），下半可展开事件账本（06 号板块）。
 *
 * # 滚动所有权
 *
 * 「跟随尾部」还是「自由阅读」由 `useScrollOwnership` 判定并提供
 * 「回到底部」按钮；本组件只负责在内容变化时把决定交给它执行——用
 * layout effect，同帧完成，否则会看到跳动。
 *
 * # 账本是另一个滚动容器
 *
 * 消息流要贴底跟随，账本要自由翻查——两者需求相反。账本因此默认折叠，
 * 展开时自己滚（见 `Ledger`）。
 */
export function ConversationStream(props: ConversationStreamProps) {
  const { entries, turns, resetKey, readonly = false } = props
  const detailLevel = useUi((s) => s.detailLevel)
  // 第 4 档（原始事件）：账本直接摊在消息流下面，不再是折叠的第二层。
  // 这样"模型到底收到了什么"不用切视图就能看。
  const [showLedger, setShowLedger] = useState(detailLevel >= 3)
  const scroll = useScrollOwnership(resetKey)
  // 导轨要按 `[data-turn]` 滚到某一轮，得直接拿到滚动容器节点。
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  // ref 回调必须是稳定引用：内联箭头函数每次渲染都是新的，React 会用 null
  // 再调一次、再用节点调一次，无谓地反复触发挂载/卸载逻辑。
  const attachScroller = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerRef.current = node
      scroll.ref(node)
    },
    [scroll],
  )

  // 档位切到 3 就自动摊开，切走就自动收起来——否则会出现
  // 「选了原始事件但什么都没变」或者「收起后账本还挂着」这种反直觉状态。
  useEffect(() => {
    setShowLedger(detailLevel >= 3)
  }, [detailLevel])

  // 只读模式剔除需要应答的条目：它们由发起线程自己处理。
  const visible = useMemo(
    () => (readonly ? entries.filter((e) => !needsAnswer(e)) : entries),
    [entries, readonly],
  )
  const blocks = useTurnBlocks(visible, turns)

  // 导轨高亮哪一轮：优先运行中的那一轮，否则最近一轮。
  const activeTurn = useMemo(() => {
    const running = turns.find((t) => t.status === 'inProgress')
    if (running) return running.index
    return turns.length > 0 ? turns[turns.length - 1]!.index : null
  }, [turns])

  // 滚到某一轮。`scrollIntoView` 会改 scrollTop，`useScrollOwnership` 的
  // onScroll 随即判定「离底还远」，自动关掉贴底跟随——正是导航该有的效果。
  const scrollToTurn = useCallback((index: number) => {
    scrollerRef.current
      ?.querySelector<HTMLElement>(`[data-turn="${index}"]`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [])

  // 内容变化时按所有权决定要不要滚。依赖用「条数 + 最后一条 id」而不是
  // 最后一条的正文：流式增量每帧都改正文，用它当依赖会每帧重排。
  const tailKey = `${visible.length}:${visible[visible.length - 1]?.id ?? ''}`
  useLayoutEffect(() => {
    scroll.sync()
  }, [tailKey, scroll])

  return (
    <div className={s.wrap}>
      {/* 浮标（回到底部 / 账本开关）与滚动容器**分开**：绝对定位的后代会被
          滚动偏移一起带走，放在 `.stream` 里时用户往上翻，「回到底部」正好
          滚出视野——而它恰恰是在那个时候才要用的。放进这层不滚动的 host，
          浮标才真的钉在可视区。 */}
      <div className={s.streamHost}>
        <div
          className={s.stream}
          ref={attachScroller}
          onScroll={scroll.onScroll}
        >
          <div className={s.inner}>
            {visible.length === 0 ? (
              <EmptyState readonly={readonly} />
            ) : (
              blocks.map((block) => <TurnRow key={block.meta.index} block={block} />)
            )}
          </div>
        </div>

        <TurnRail turns={turns} activeTurn={activeTurn} onNavigate={scrollToTurn} />

        {!scroll.following && (
          <button type="button" className={s.jump} onClick={scroll.scrollToBottom}>
            ↓ 回到底部
          </button>
        )}

        <button
          type="button"
          className={s.ledgerToggle}
          onClick={() => setShowLedger(!showLedger)}
          aria-expanded={showLedger}
          aria-label={showLedger ? '收起事件账本' : '展开事件账本'}
        >
          {showLedger ? '▾ 事件账本' : '▸ 事件账本'}
        </button>
      </div>

      {showLedger && (
        <Suspense fallback={null}>
          <Ledger threadId={resetKey} inline={detailLevel >= 3} />
        </Suspense>
      )}
    </div>
  )
}

/** 需要用户应答的条目。只读视图里不渲染。 */
function needsAnswer(entry: Entry): boolean {
  return entry.kind === 'approval' || entry.kind === 'userInput' || entry.kind === 'elicitation'
}

/**
 * 一个回合的外壳。
 *
 * `memo` 的前提是 `block` 引用稳定——`useTurnBlocks` 已保证未变回合复用同一
 * 块对象。这样父层（每条 delta 都会重渲染）不会连带重渲染没变的回合。
 */
const TurnRow = memo(function TurnRow({ block }: { block: ReturnType<typeof useTurnBlocks>[number] }) {
  const detailLevel = useUi((s) => s.detailLevel)
  // 只挑用到的字段/动作，**不要** `useShell()` 整店订阅：动作引用在 store
  // 生命周期内是稳定的，而状态对象每条事件都变。整店订阅会让每个回合块在
  // 每条 delta 上都重渲染（这是长会话卡顿的主因之一）。
  const answerApproval = useShell((s) => s.answerApproval)
  const answerUserInput = useShell((s) => s.answerUserInput)
  const answerElicitation = useShell((s) => s.answerElicitation)
  const resumeThread = useShell((s) => s.resumeThread)
  const revert = useShell((s) => s.revert)
  const activeThreadId = useShell((s) => s.activeThreadId)

  const onApprove = useCallback(
    (id: unknown) => void answerApproval(id, 'approve'),
    [answerApproval],
  )
  const onDecline = useCallback(
    (id: unknown) => void answerApproval(id, 'decline'),
    [answerApproval],
  )
  const onUserInput = useCallback(
    (id: unknown, answers: Record<string, string>) => void answerUserInput(id, answers),
    [answerUserInput],
  )
  const onElicitation = useCallback(
    (id: unknown, content: unknown) => void answerElicitation(id, content),
    [answerElicitation],
  )
  const onOpenThread = useCallback((id: string) => void resumeThread(id), [resumeThread])
  const onRevert = useCallback(
    (beforeTurnId: string) => {
      if (activeThreadId) void revert(activeThreadId, beforeTurnId)
    },
    [activeThreadId, revert],
  )
  const onSubAgent = useCallback((id: string) => {
    setWatchedThread(id)
    toggleDockTab('subagent')
  }, [])

  return (
    <TurnBlock
      meta={block.meta}
      nodes={block.nodes}
      detailLevel={detailLevel}
      onApprove={onApprove}
      onDecline={onDecline}
      onUserInput={onUserInput}
      onElicitation={onElicitation}
      onOpenThread={onOpenThread}
      onRevert={onRevert}
      onSubAgent={onSubAgent}
    />
  )
})

function EmptyState({ readonly }: { readonly: boolean }) {
  return (
    <div className={s.empty}>
      <h3 className={s.emptyTitle}>{readonly ? '这个子代理还没有产出' : '开始一个新回合'}</h3>
      <p className={s.emptyBody}>
        {readonly ? (
          '它的实时事件会出现在这里。'
        ) : (
          <>
            在下方输入框写点什么。
            <br />
            用 <code>@</code> 引用文件或技能，<code>/</code> 调命令。
          </>
        )}
      </p>
      {!readonly && (
        <ul className={s.emptyHints}>
          <li>
            <kbd>Enter</kbd> 发送 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 换行
          </li>
          <li>
            <kbd>Ctrl</kbd>+<kbd>.</kbd> 中断当前回合
          </li>
        </ul>
      )}
    </div>
  )
}