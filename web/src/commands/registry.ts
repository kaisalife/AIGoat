/**
 * 命令注册表（08 号板块）。
 *
 * 抄 dsh 的 `ui-commands`，砍掉的部分：命令定义不在运行时被外部注册
 * （没有插件市场），但**注册表的形状**保留——`/` 弹层、`+` 菜单、设置中心
 * 的快捷键参考表都从这一张表出，加命令只改一处。
 *
 * ## 三种派发类型（照抄 dsh）
 *
 * | 类型 | 何时执行 | 例子 |
 * |---|---|---|
 * | `popupSelect` | 从弹层选中即执行 | `/compact` `/model` `/permission` |
 * | `action` | 立刻执行（`+` 菜单直接派发） | `/goal` 打开气泡 |
 * | `execute` | 提交消息时执行，**不发给模型** | `/plan` |
 *
 * `execute` 类是关键：它把命令变成一条"本地动作"，模型看不到——
 * `/plan 帮我加上缓存` 里只有"帮我加上缓存"会被发出去。
 *
 * ## 为什么 handler 不写在这里
 *
 * 命令要动 store（压缩当前线程、切模型、打开气泡），而 store 依赖 React
 * 上下文。注册表是纯数据，`builtin.ts` 在组合层把 handler 绑上去——
 * 这样注册表可以单独测试，也不用为了测试去 mock 整个 store。
 */

/** 派发类型。见上表。 */
export type Dispatch = 'popupSelect' | 'action' | 'execute'

export type CommandGroup = '会话' | '上下文' | '配置' | '文件'

export interface CommandSpec {
  /** 不含 `/` 的命令名（`/plan` → `plan`）。 */
  id: string
  title: string
  group: CommandGroup
  /** 一行说明，写进弹层的副标题。 */
  hint: string
  dispatch: Dispatch
  /**
   * 执行动作。
   *
   * `popupSelect` 拿到选中项，`execute` 拿到输入框里命令名之后的文本，
   * `action` 两者都拿不到。
   */
  run: (ctx: CommandContext) => void | Promise<void>
}

export interface CommandContext {
  /** 弹层选中项的 label；`popupSelect` 用。 */
  selected?: string
  /** 输入框里命令名之后的文本。 */
  text?: string
}

/** 名称到命令的表。`builtin.ts` 在启动时填进去。 */
const TABLE = new Map<string, CommandSpec>()

export function getCommand(id: string): CommandSpec | undefined {
  return TABLE.get(id)
}

export function allCommands(): CommandSpec[] {
  return [...TABLE.values()]
}

export function registerCommand(spec: CommandSpec): void {
  TABLE.set(spec.id, spec)
}

/** 清空注册表（切换工作区时用：不同工作区的命令集合可能不同）。 */
export function clearCommands(): void {
  TABLE.clear()
}

/** 按分组排序（弹层与 `+` 菜单共用这个顺序）。 */
export function commandsByGroup(): { group: CommandGroup; commands: CommandSpec[] }[] {
  const groups: CommandGroup[] = ['会话', '上下文', '配置', '文件']
  return groups
    .map((group) => ({ group, commands: allCommands().filter((c) => c.group === group) }))
    .filter((g) => g.commands.length > 0)
}

/**
 * 命令名 → 规范 id。`/Plan` 与 `/plan` 是同一个命令。
 *
 * 输入框里用户打的大小写不该决定命中哪条命令——但**显示**时统一小写，
 * 免得弹层里出现 `/Plan` 和 `/plan` 两条看起来一样的条目。
 */
export function normalizeCommand(raw: string): string {
  return raw.trim().replace(/^\//, '').toLowerCase()
}