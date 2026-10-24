/**
 * 内置命令清单：把 store 动作绑到命令注册表上（08 号板块）。
 *
 * 绑定的时机是**组合层**（某个槽组件里），不是模块顶层——模块顶层求值时
 * store 还没连上，`useShell.getState()` 会拿到空壳。
 *
 * 声明与 handler 分开写（`DECLS` 只有元信息，`run` 才有动作），
 * 这样「这个应用有哪些命令、各是什么派发类型」一眼看得全，
 * 不用在一堆 `useShell.getState()` 里找。
 */

import { registerCommand, type CommandSpec } from './registry'

export interface CommandActions {
  compact: () => void
  /** 把当前会话导出成 Markdown 并落盘。 */
  exportMarkdown: () => void
  /** 按名字引用一个技能（插成 `@技能名`）。 */
  referenceSkill: (name: string) => void
  setModel: (id: string) => void
  setProfile: (id: string) => void
  openGoal: (objective?: string) => void
  focusPlan: () => void
  referenceFile: (path: string) => void
}

interface Decl {
  id: string
  title: string
  group: CommandSpec['group']
  hint: string
  dispatch: CommandSpec['dispatch']
  /**
   * 动作。
   *
   * `popupSelect` 拿选中项，`execute` 拿输入框里命令名之后的文本，
   * `action` 两者都拿不到。三个形参都可能 undefined——用户在弹层里
   * 什么都没选就回车时不该抛，一律按"没给参数"处理。
   */
  run: (actions: CommandActions, ctx: { selected?: string; text?: string }) => void
}

const DECLS: Decl[] = [
  {
    id: 'plan',
    title: '计划模式',
    group: '会话',
    hint: '本条消息按「先出计划再动手」处理',
    dispatch: 'execute',
    run: (a) => a.focusPlan(),
  },
  {
    id: 'compact',
    title: '压缩上下文',
    group: '上下文',
    hint: '把更早的消息摘要掉，腾出窗口',
    dispatch: 'popupSelect',
    run: (a) => a.compact(),
  },
  {
    id: 'export',
    title: '导出当前会话为 Markdown',
    group: '会话',
    hint: '把这一轮的全部回合写成一个 .md 文件',
    dispatch: 'action',
    run: (a) => a.exportMarkdown(),
  },
  {
    id: 'skill',
    title: '技能',
    group: '文件',
    hint: '按名字引用一个技能（先读它的说明再决定要不要用）',
    dispatch: 'popupSelect',
    // 必须等弹层选中：`referenceSkill('')` 会往输入框插一个空的 `@`。
    run: (a, ctx) => {
      if (ctx.selected) a.referenceSkill(ctx.selected)
    },
  },
  {
    id: 'goal',
    title: '设置目标',
    group: '会话',
    hint: '给这一轮一个可核查的目标，模型会持续奔着它跑',
    dispatch: 'popupSelect',
    // 目标文本可以直接跟在命令后面：`/goal 把缓存加上`。
    run: (a, ctx) => a.openGoal(ctx.selected ?? ctx.text),
  },
  {
    id: 'model',
    title: '切换模型',
    group: '配置',
    hint: '从已配置的自定义模型里挑一个',
    dispatch: 'popupSelect',
    run: (a, ctx) => {
      if (ctx.selected) a.setModel(ctx.selected)
    },
  },
  {
    id: 'permission',
    title: '权限档位',
    group: '配置',
    hint: '新会话起用的审批档位',
    dispatch: 'popupSelect',
    run: (a, ctx) => {
      if (ctx.selected) a.setProfile(ctx.selected)
    },
  },
  {
    id: 'file',
    title: '引用文件',
    group: '文件',
    hint: '把工作区里的文件插进这一条消息',
    dispatch: 'popupSelect',
    run: (a, ctx) => {
      if (ctx.selected) a.referenceFile(ctx.selected)
    },
  },
  {
    id: 'team',
    title: '选团队',
    group: '团队',
    // 选择器命令：输入框会把候选项直接摆出来（见 TriggerManager 的 pickerQuery），
    // 选中后插入 `@团队名 `，这条命令本身不需要做任何事。
    hint: '插入 @团队名，让整个团队按工作流协作',
    dispatch: 'popupSelect',
    run: () => {},
  },
  {
    id: 'per',
    title: '选人',
    group: '团队',
    // 同上：`/per` 打开人员列表，选中插入 `@人名 `，表示用这个人的能力。
    hint: '插入 @人名，用这位成员的能力处理这条消息',
    dispatch: 'popupSelect',
    run: () => {},
  },
]

/** 把声明表编译进注册表。启动时调一次。 */
export function installBuiltinCommands(actions: CommandActions): void {
  for (const decl of DECLS) {
    registerCommand({
      id: decl.id,
      title: decl.title,
      group: decl.group,
      hint: decl.hint,
      dispatch: decl.dispatch,
      run: (ctx) => decl.run(actions, ctx),
    })
  }
}