import clsx from 'clsx'
import { ThreadRow } from './ThreadRow'
import type { ThreadRowActions } from './ThreadRow'
import type { ThreadSummary } from '../../bridge/types'
import s from './ThreadList.module.css'

export interface ArchiveSectionProps extends ThreadRowActions {
  archived: ThreadSummary[]
  activeThreadId: string | null
  multi: boolean
  checked: string[]
  open: boolean
  onToggle: () => void
  onToggleCheck: (id: string) => void
}

/**
 * 归档区（折叠在分组之后）。
 *
 * 单独成文件是因为它有自己的展开状态与"取消归档"分支——那是与主列表
 * **相反**的操作（列表里是归档，这里是取消），放在同一段 JSX 里容易被读成
 * "同一个按钮有两种含义"。
 */
export function ArchiveSection(props: ArchiveSectionProps) {
  const { archived, activeThreadId, multi, checked, open, onToggle, onToggleCheck } = props

  if (archived.length === 0) return null

  return (
    <section className={s.group}>
      <button className={clsx(s.groupHead, s.groupHeadBtn)} onClick={onToggle} aria-expanded={open}>
        <span className={clsx(s.caret, open && s.caretOpen)}>▸</span>
        已归档
        <span className={s.count}>{archived.length}</span>
      </button>
      {open && (
        <ul>
          {archived.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              active={thread.id === activeThreadId}
              multi={multi}
              checked={checked.includes(thread.id)}
              onToggleCheck={onToggleCheck}
              archived
              onResume={props.onResume}
              onArchive={props.onArchive}
              onUnarchive={props.onUnarchive}
              onDelete={props.onDelete}
              onRename={props.onRename}
              onCompact={props.onCompact}
              onFork={props.onFork}
              onPin={props.onPin}
            />
          ))}
        </ul>
      )}
    </section>
  )
}