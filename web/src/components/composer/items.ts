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