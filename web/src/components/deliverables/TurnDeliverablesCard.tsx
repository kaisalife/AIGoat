import { useMemo } from 'react'
import { useShell } from '../../store/shell'
import { useEditor } from '../../store/editor'
import { CardShell } from '../cards/CardShell'
import type { Entry, FileEditEntry } from '../../store/entries'
import s from './TurnDeliverables.module.css'

/**
 * 回合尾的交付物聚合卡（11 号板块 §3.2）。
 *
 * # 为什么不用 `turn/diff/updated` 而是从条目里聚合
 *
 * `turnDiffUpdated` 给的是**整轮 diff 的合并文本**，没有按文件拆分；而
 * `fileChange` 条目天然按文件分组（05 号板块已经映射）。从条目聚合能拿到
 * 每文件独立的 diff，代价是要自己算行数——那只是数 `+`/`-` 行。
 *
 * 协议核实过：`turn/diff/updated` 里**没有文件路径**，所以它没法做
 * "点击文件跳转"这件事。
 */
export function TurnDeliverablesCard({ entries }: { entries: Entry[] }) {
  const changes = useMemo(() => collectFileChanges(entries), [entries])
  const cwd = useShell((s) => s.cwd)
  const openFile = useEditor((s) => s.openFile)

  if (changes.length === 0) return null

  const { added, removed } = countLines(changes)
  return (
    <CardShell
      summary={`本轮改动 ${changes.length} 个文件`}
      badge="交付"
      tone="success"
      defaultOpen
      meta={
        <span className={s.stat}>
          <span className={s.plus}>+{added}</span>
          <span className={s.minus}>−{removed}</span>
        </span>
      }
    >
      <ul className={s.list}>
        {changes.map((file) => {
          const path = absolute(cwd, file.changes[0]?.path ?? '')
          return (
            <li key={file.path}>
              <button
                type="button"
                className={s.row}
                title={path}
                onClick={() => void openFile(path)}
              >
                <span className={s.path}>{file.path}</span>
                <span className={s.spacer} />
                <span className={s.stat}>
                  <span className={s.plus}>+{file.added}</span>
                  <span className={s.minus}>−{file.removed}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </CardShell>
  )
}

interface FileSummary {
  path: string
  changes: { path: string; diff: string }[]
  added: number
  removed: number
}

/** 把条目里的 fileChange 归到"本轮"。命令写的文件也算交付物。 */
function collectFileChanges(entries: Entry[]): FileSummary[] {
  const byPath = new Map<string, FileSummary>()
  for (const entry of entries) {
    if (entry.kind !== 'fileEdit') continue
    for (const change of (entry as FileEditEntry).changes) {
      const key = change.path || '（未命名）'
      const existing = byPath.get(key)
      const { added, removed } = countDiff(change.diff)
      if (existing) {
        existing.added += added
        existing.removed += removed
        existing.changes.push({ path: change.path, diff: change.diff })
      } else {
        byPath.set(key, { path: key, changes: [{ path: change.path, diff: change.diff }], added, removed })
      }
    }
  }
  return [...byPath.values()].sort((a, b) => b.added + b.removed - (a.added + a.removed))
}

function countLines(files: FileSummary[]): { added: number; removed: number } {
  return files.reduce(
    (sum, f) => ({ added: sum.added + f.added, removed: sum.removed + f.removed }),
    { added: 0, removed: 0 },
  )
}

function countDiff(diff: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added += 1
    else if (line.startsWith('-') && !line.startsWith('---')) removed += 1
  }
  return { added, removed }
}

/**
 * 补全成绝对路径。
 *
 * 协议给的 `FileChange.path` 是**相对 cwd** 的，而 `bridge_fs_read` 要的是
 * 绝对路径——直接传相对路径会去进程的工作目录找，那不是用户的工作区。
 */
function absolute(cwd: string, path: string): string {
  if (!path || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('/')) return path
  const sep = cwd.includes('\\') && !cwd.includes('/') ? '\\' : '/'
  return `${cwd.replace(/[\\/]+$/, '')}${sep}${path.replace(/^[\\/]+/, '')}`
}
