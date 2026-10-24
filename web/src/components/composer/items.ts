/**
 * 触发弹层的候选条目（命令与文件）。
 *
 * 单独成文件是因为它有两种性质完全不同的来源：命令来自注册表（稳定、
 * 带说明），文件来自工作区树（随用户展开而变）。混在状态机文件里会让
 * 「这个列表从哪来」这件事看不清。
 */

import { commandsByGroup, normalizeCommand } from '../../commands/registry'
import { rankByName } from '../primitives/rankByName'
import type { PopupItem } from './TriggerManager'

export interface FileNode {
  path: string
  name: string
}

/** 技能候选的最小形状（resources store 的 SkillInfo 与这里解耦）。 */
export interface SkillCandidate {
  name: string
  description: string
}

/** 团队候选的最小形状（bridge 的 TeamRow 与这里解耦）。 */
export interface TeamCandidate {
  name: string
  /** 一行提示：成员清单（或「暂无成员」）。 */
  hint: string
}

/** 人员候选的最小形状：注册表里的原初成员（副本不算"人"）。 */
export interface MemberCandidate {
  name: string
  /** 一行提示：职责（desc），没有就列技能。 */
  hint: string
}

/** 选择器命令：命令名不是"执行"，而是"把候选摆出来"。 */
const PICKER_COMMANDS = ['skill', 'file', 'team', 'per'] as const
export type PickerCommand = (typeof PICKER_COMMANDS)[number]

/** 该命令是不是选择器（`/skill` `/file` `/team` `/per`）。 */
export function isPickerCommand(id: string): id is PickerCommand {
  return (PICKER_COMMANDS as readonly string[]).includes(id)
}

/**
 * 选择器命令的过滤词。
 *
 * `/skill` = 列出全部技能，`/skill team` = 用 `team` 过滤；`/file`、`/team`、
 * `/per` 同理。用户不需要先记住名字——这是这些命令存在的全部意义。
 *
 * 只有「命令名 + 空格」才算过滤，所以 `/permission` 不会被 `/per` 吃掉。
 */
export function pickerQuery(
  query: string,
): { kind: PickerCommand; query: string } | null {
  const q = normalizeCommand(query)
  for (const kind of PICKER_COMMANDS) {
    if (q === kind) return { kind, query: '' }
    if (q.startsWith(`${kind} `)) {
      return { kind, query: q.slice(kind.length + 1).trim() }
    }
  }
  return null
}

/**
 * 命令候选（按分组）。
 *
 * 排序用 dsh 的 `rankByName`：大小写不敏感**有序子序列**匹配（id 或
 * 标题+说明都算键），前缀命中优先、边界加权、同分保持注册表顺序；空查询
 * 原样返回注册表顺序。命令量级 < 100（08 §3.2），每个键击全文打分无压力。
 */
export function commandItems(query: string): PopupItem[] {
  const q = normalizeCommand(query)
  const candidates: { popup: PopupItem; name: string; label: string }[] = []
  for (const { group, commands } of commandsByGroup()) {
    for (const command of commands) {
      candidates.push({
        popup: {
          kind: 'command',
          id: command.id,
          label: `/${command.id}`,
          hint: command.hint,
          group,
        },
        name: command.id,
        label: `${command.title}${command.hint ? ` ${command.hint}` : ''}`,
      })
    }
  }
  return rankByName(candidates, q).map((c) => c.popup)
}

/**
 * 技能候选：codex 已加载的技能（`skills/list`），插进消息就是一次
 * `$技能名` mention——codex 原生识别这个语法并注入对应 SKILL.md。
 *
 * 量级小（几十条），沿用 rankByName 与命令一致的前缀优先体验。
 */
export function skillItems(query: string, skills: SkillCandidate[]): PopupItem[] {
  const q = normalizeCommand(query)
  const candidates = skills.map((s) => ({
    popup: {
      kind: 'skill' as const,
      id: s.name,
      label: `$${s.name}`,
      hint: s.description,
      group: '技能',
    },
    name: s.name,
    label: s.description,
  }))
  return rankByName(candidates, q).map((c) => c.popup)
}

/**
 * 团队候选：注册表里的编组，`@` 弹层里跟文件一起出现。
 *
 * 选中插 `@团队名 `：对用户是「我点名了这支团队」，对 codex 是个明确的
 * 协作信号（注入的派单说明解释了这个记号）。量级小，
 * 用路径子串同款的 includes 匹配即可，不值得上 rankByName。
 */
export function teamItems(query: string, teams: TeamCandidate[]): PopupItem[] {
  const q = query.trim().toLowerCase()
  return teams
    .filter((t) => !q || t.name.toLowerCase().includes(q))
    .map((t) => ({ kind: 'team' as const, id: t.name, label: t.name, hint: t.hint, group: '团队' }))
}

/**
 * 人员候选：注册表里的原初成员，`/per` 弹层用。
 *
 * 选中插 `@人名 `——与团队同一个点名记号，含义是"用 TA 的能力"（团队用
 * `@团队名 ` 表示整队协作）。职责也参与匹配：`/per 评审` 能找到 reviewer。
 */
export function memberItems(query: string, members: MemberCandidate[]): PopupItem[] {
  const q = query.trim().toLowerCase()
  return members
    .filter((m) => !q || m.name.toLowerCase().includes(q) || m.hint.toLowerCase().includes(q))
    .map((m) => ({
      kind: 'member' as const,
      id: m.name,
      label: m.name,
      hint: m.hint,
      group: '人员',
    }))
}

/**
 * 文件候选：路径或文件名子串，**最多 50 条**。
 *
 * 上限是必要的：一个装满依赖的目录能出几万条，全渲染会把弹层卡死。
 * 截断在前 50 条（保持树的自然顺序，也就是用户预期的"上面那些"）。
 *
 * 刻意**不**用 rankByName 的子序列打分：文件量级上万，每个键击对每条
 * 路径做 O(路径长 × 查询长) 的动态规划是几千万次字符比较；路径子串匹配
 * 已经覆盖了绝大多数找文件意图。命令侧量级小才用得起相关性排序。
 */
export function fileItems(query: string, files: FileNode[]): PopupItem[] {
  const q = query.trim().toLowerCase()
  return files
    .filter((f) => !q || f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
    .slice(0, 50)
    .map((f) => ({ kind: 'file' as const, id: f.path, label: f.name, group: dirname(f.path) }))
}

/** 目录分组：按父目录分段，弹层里同类文件挨在一起。 */
function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i > 0 ? path.slice(0, i) : '/'
}