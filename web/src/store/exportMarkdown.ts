/**
 * 会话导出为 Markdown（08 号板块的 `/export`）。
 *
 * # 为什么自己拼而不是拿账本倒
 *
 * 账本（06 号板块）是 ring buffer，5000 行封顶，且**包含未建模事件与流式
 * 中间态**——直接导出会得到一��满是 `textDelta` 碎片的文件。回合态
 * （`turn.entries`）才是"人读的东西"：已归组、已折叠、只有定稿条目。
 *
 * # 落盘位置
 *
 * 写在**工作区目录**下、名字带时间戳。不问用户存哪：导出是个低频动作，
 * 多一个文件选择框就多一次打断；文件名带会话摘要的前 30 字，找得到。
 */

import { getClient } from '../bridge/session'
import type { Entry } from './entries'
import type { TurnMeta } from './turnState'

/** 转成 Markdown 文本。纯函数，便于单测。 */
export function toMarkdown(
  entries: Entry[],
  turns: TurnMeta[],
  meta: { cwd: string; model?: string },
): string {
  const out: string[] = []
  const title = turns[0]?.preview || '未命名会话'

  out.push(`# ${title}`, '')
  out.push(
    `- 工作区：\`${meta.cwd || '（无）'}\``,
    `- 模型：${meta.model || '（未知）'}`,
    `- 回合数：${turns.length}`,
    `- 导出时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    '---',
    '',
  )

  // 按回合分节：导出的文件要能看出"哪一轮做了什么"。
  const byTurn = new Map<number, Entry[]>()
  for (const entry of entries) {
    const bucket = byTurn.get(entry.turn)
    if (bucket) bucket.push(entry)
    else byTurn.set(entry.turn, [entry])
  }

  for (const meta2 of turns) {
    out.push(`## 回合 ${meta2.index + 1}${meta2.preview ? ` · ${meta2.preview}` : ''}`, '')
    out.push(`状态：${meta2.status}${meta2.usage ? ` · ${meta2.usage.total} tokens` : ''}`, '')
    for (const entry of byTurn.get(meta2.index) ?? []) {
      out.push(renderEntry(entry))
    }
  }
  return out.join('\n')
}

/** 单条 → Markdown 行。工具调用用围栏代码块，正文按原文。 */
function renderEntry(entry: Entry): string {
  switch (entry.kind) {
    case 'user':
      return `**你**：\n\n${entry.text}\n`
    case 'assistant':
      return `**Agent**：\n\n${entry.text}\n`
    case 'reasoning':
      return `> 推理（${entry.isSummary ? '摘要' : '正文'}）：\n>\n> ${entry.text.replace(/\n/g, '\n> ')}\n`
    case 'tool':
      return [
        '```text',
        `$ ${entry.name}${entry.status === 'failed' ? '  [失败]' : ''}`,
        entry.output ? entry.output.trimEnd() : '',
        '```',
        '',
      ].join('\n')
    case 'fileEdit':
      return [
        '**文件变更**',
        '',
        ...entry.changes.map((c) => `- \`${c.path}\`（${c.kind}）`),
        '',
      ].join('\n')
    case 'approval':
      return `> 审批：${entry.approvalKind} · ${entry.state}${entry.decision ? ` · ${entry.decision}` : ''}\n`
    case 'userInput':
      return `> 提问：${entry.questions.map((q) => q.header || q.question).join('；')}\n`
    case 'compaction':
      return `> 上下文压缩${entry.byUser ? '（手动）' : '（自动）'}\n`
    case 'reviewMode':
      return `---\n\n*${entry.mode === 'entered' ? '进入' : '退出'}复核：${entry.review}*\n`
    case 'subAgent':
      return `> 子代理 ${entry.activity}：\`${entry.agentPath || entry.agentThreadId}\`\n`
    case 'notice':
      return `> [${entry.level}] ${entry.text}\n`
    case 'divider':
      return `---\n`
    default:
      // 未建模的条目不进导出：它们大多会被上面的分支覆盖，
      // 剩下的写一行占位比静默丢弃更容易发现漏了什么。
      return `*（${entry.kind}）*\n`
  }
}

/** 导出并落盘。返回写出的路径，失败抛给调用方。 */
export async function exportSessionMarkdown(
  entries: Entry[],
  turns: TurnMeta[],
  meta: { cwd: string; model?: string },
): Promise<string> {
  const markdown = toMarkdown(entries, turns, meta)
  const name = `aigoat-${stamp()}-${slug(meta.cwd)}.md`
  const path = meta.cwd ? `${meta.cwd}\\${name}` : name
  await getClient().fsWrite(path, markdown)
  return path
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

/** 用工作区目录名当标识：同一个会话连续导出不会互相覆盖。 */
function slug(cwd: string): string {
  const base = cwd.split(/[\\/]/).filter(Boolean).pop() ?? 'session'
  return base.replace(/[^\w一-龥-]/g, '_').slice(0, 24)
}