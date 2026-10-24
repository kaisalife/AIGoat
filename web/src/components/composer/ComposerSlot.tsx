import { useCallback, useEffect, useMemo, useState } from 'react'
import { Composer } from './Composer'
import { GoalBubble } from '../goal/GoalBubble'
import { GoalStrip } from '../goal/GoalStrip'
import { useApprovalTakeover } from '../approval/useApprovalTakeover'
import { CompactionNotice } from '../context/CompactionNotice'
import { DraftTray } from '../attachment/DraftTray'
import { toggleDockTab } from '../dock/useDockStore'
import { useLayoutStore } from '../layout/useLayoutStore'
import { PlanChip, planPhaseOf } from '../plan/PlanChip'
import { DropOverlay } from '../attachment/DropOverlay'
import { PlusMenu } from './PlusMenu'
import { useTeamNames } from './useTeamNames'
import type { TeamCandidate } from './TriggerManager'
import { installBuiltinCommands, type CommandActions } from '../../commands/builtin'
import { exportSessionMarkdown } from '../../store/exportMarkdown'
import { useEditor } from '../../store/editor'
import { useSettingsStore } from '../settings/useSettingsStore'
import { useShell, type ShellState } from '../../store/shell'
import { useResources } from '../../store/resources'
import { useComposerBridge } from '../../store/composerBridge'
import { shallow } from 'zustand/shallow'

/**
 * 输入区槽：把命令、目标、文件三样接起来。
 *
 * 单独一层而不是让 `ChatView` 直接用 `Composer`，是因为绑定需要四个 store
 * 加一个命令注册表——放在 `ChatView` 会让那个文件从"摆位"变成"接线板"。
 *
 * ## 命令注册表在这里安装
 *
 * 注册表是模块级的可变表，而 handler 需要已经连上的 store。装在组件里
 * （而不是模块顶层）保证求值时机在 store 之后。
 */
export function ComposerSlot() {
  const {
    cwd,
    activeThreadId,
    turnStatus,
    contextWindow,
    tokens,
    plan,
    turnActive,
    send,
    interrupt,
    loadGoal,
    setHint,
    setModel,
    compact,
    dismissCompactionNotice,
  } = useShell(
    (s) => ({
      cwd: s.cwd,
      activeThreadId: s.activeThreadId,
      turnStatus: s.turnStatus,
      contextWindow: s.contextWindow,
      tokens: s.tokens,
      // 只取计划与回合活跃态，**不取整个 turn**：`turn.entries` 每帧都因
      // 流式正文而变，整取会让输入区（含编辑器）跟着每条 delta 重渲染。
      plan: s.turn.plan,
      turnActive: s.turn.turnActive,
      send: s.send,
      interrupt: s.interrupt,
      loadGoal: s.loadGoal,
      setHint: s.setHint,
      setModel: s.setModel,
      compact: s.compact,
      dismissCompactionNotice: s.dismissCompactionNotice,
    }),
    shallow,
  )
  // 压缩提示条单独用选择器取：返回的条目引用在流式期间不变，输入区因此
  // 不会因为"每帧扫一遍 entries"而重渲染。
  const compactionNotice = useShell(latestCompactionNotice)
  const tree = useEditor((s) => s.tree)
  // 技能清单：`/` 弹层里跟在本地命令后面的「技能」分组（skillsChanged 事件
  // 自动刷新，技能装/卸后弹层内容自动跟上）。
  const skills = useResources((s) => s.skills)
  // 团队清单：`@` 弹层的「团队」分组（registry-changed 自动刷新，codex 改
  // 注册表后弹层候选自动跟上）。
  const teamRows = useTeamNames()
  const teams = useMemo<TeamCandidate[]>(
    () =>
      teamRows.map((t) => ({
        name: t.name,
        hint: t.members.length > 0 ? t.members.join(' / ') : '暂无成员',
      })),
    [teamRows],
  )
  const enterSends = useSettingsStore((s) => s.enterSends)
  const [goalOpen, setGoalOpen] = useState(false)
  const [goalSeed, setGoalSeed] = useState<string | undefined>(undefined)
  // 草稿提到槽里：审批接管期间 composer 整个被换掉，不提上来就丢了
  // （12 号板块 §3.1 的焦点模型）。
  const [draft, setDraft] = useState('')

  // 文件树右键「添加到对话」等外部注入：桥 store 里排队一段文本，
  // 这里消费并追加进草稿（空格分隔；连续插入同一段文本也要生效）。
  const pendingInsert = useComposerBridge((s) => s.pending)
  useEffect(() => {
    if (!pendingInsert) return
    setDraft((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${pendingInsert.text} `)
    useComposerBridge.getState().consumeInsert()
  }, [pendingInsert])

  const busy = turnStatus === 'inProgress'

// `+` 菜单与命令派发共用的动作。
  const actions = useMemo<CommandActions>(
    () => ({
      compact: () => void compact(),
      exportMarkdown: () => void runExport(),
      // 技能引用插成 `@技能名 `：与文件引用同一条触发管线，用户看到
      // 的是"我确实引用了它"，而不是一个凭空消失的副作用。
      referenceSkill: (name: string) => setDraft((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}@${name} `),
      setModel: (id: string) => void setModel(id),
      setProfile: (id: string) => {
        // 权限档位只落设置（`settings.json` 的 ui 段），不发任何 codex 请求：
        // 它是「新会话起用什么」的偏好，不是对当前回合的干预。
        void useSettingsStore.getState().update({ defaultPermissionProfile: id })
      },
      openGoal: (objective?: string) => {
        setGoalSeed(objective)
        setGoalOpen(true)
      },
      focusPlan: () => {
        // 计划全文在右栏（07 号板块）：active 态点一下就切过去，
        // 计划会随回合推进不断更新，放在消息流里会把用户正在读的内容顶走。
        void setHint('计划模式：下一条消息会先出计划，计划全文在右栏「计划」页。')
        toggleDockTab('plan')
      },
      referenceFile: () => {
        // 文件引用由 @ 触发管线插入；`+` 菜单里没有这一项
        // （08 §3.3 的图形入口清单不含文件引用——它需要一个文件选择器）。
      },
    }),
    [compact, setHint, setModel],
  )

// 导出：写到工作区目录，文件名带时间戳（见 exportMarkdown.ts 的说明）。
  const runExport = useCallback(async () => {
    const s = useShell.getState()
    if (!s.activeThreadId) {
      void setHint('还没有会话，没什么可导出的。')
      return
    }
    try {
      const path = await exportSessionMarkdown(s.turn.entries, s.turn.turns, {
        cwd: s.cwd,
        model: s.modelId,
      })
      void setHint(`已导出到 ${path}`)
    } catch (err) {
      void setHint(`导出失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }, [setHint])

  useEffect(() => {
    installBuiltinCommands(actions)
  }, [actions])

  // 切会话重拉目标（目标是每会话的）。
  useEffect(() => {
    void loadGoal()
  }, [activeThreadId])

  // @file 的候选：把**已加载的那几层**拍平成路径列表。
  //
  // 只索引当前已加载的层，不递归整棵树：深层目录要等用户展开，
  // 而"展开某个目录"本身就是他在想什么——提前全量索引既慢又没帮上忙。
  const files = useMemo(
    () =>
      tree.flatMap((entry) =>
        entry.isDir
          ? [{ path: entry.path, name: `${entry.name}/` }]
          : [{ path: entry.path, name: entry.name }],
      ),
    [tree],
  )

  const openGoal = useCallback((text?: string) => {
    setGoalSeed(text)
    setGoalOpen(true)
  }, [])

// 审批 / 提问期间接管 composer（12 号板块）。两者都是"模型在等一个决定"，
  // 输入区留着会让人以为还能继续发消息。
  const takeover = useApprovalTakeover()

  // 计划胶囊（07 号）：active 态点开右栏计划全文，done 态展开步骤摘要。
  const planPhase = planPhaseOf(plan, turnActive)
  const [planSummary, setPlanSummary] = useState(false)

  return (
    <>
      {takeover ? (
        takeover
      ) : (
        <>
          <CompactionNotice
            notice={compactionNotice}
            onDismiss={(id) => dismissCompactionNotice(id)}
            // 「查看记录」跳的是**主视图**（事件回放），不是右栏 —— Trajectory
            // 是中栏的第二个视图，不是 dock tab。
            onInspect={() => useLayoutStore.getState().setMainView('trajectory')}
          />
          <PlanChip
            plan={plan}
            phase={planPhase}
            showSummary={planSummary}
            onOpen={() => toggleDockTab('plan')}
            onToggleSummary={() => setPlanSummary(!planSummary)}
          />
          <DraftTray />
          <Composer
            busy={busy}
            blocked={false}
            steer={busy}
            tokensUsed={tokens.input + tokens.output}
            contextLimit={contextWindow}
            tokens={tokens}
            enterSends={enterSends}
            files={files}
            skills={skills}
            teams={teams}
            draft={draft}
            onDraftChange={setDraft}
            onSend={(t) => void send(t)}
            onStop={() => void interrupt()}
          />
        </>
      )}
      <GoalStrip onEdit={() => openGoal()} />
      <DropOverlay />
      <PlusMenu onOpenGoal={openGoal} onCompact={actions.compact} cwd={cwd} />
      <GoalBubble
        open={goalOpen}
        initialText={goalSeed}
        onClose={() => {
          setGoalOpen(false)
          setGoalSeed(undefined)
        }}
      />
    </>
  )
}

/**
 * 最新一条未关闭的压缩提示（13 号板块）。
 *
 * 抽成模块级选择器：返回的条目引用稳定，只有提示条本身变化时才让输入区
 * 重渲染——内联 useMemo 依赖 `turn.entries` 会在每条流式 delta 上重算。
 */
function latestCompactionNotice(s: ShellState) {
  for (let i = s.turn.entries.length - 1; i >= 0; i--) {
    const entry = s.turn.entries[i]
    if (entry?.kind === 'compactionNotice' && !entry.dismissed) return entry
  }
  return null
}