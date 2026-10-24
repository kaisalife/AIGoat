/**
 * 会话列表：新建入口 + 搜索 + 置顶区 + 时间分组 + 归档区（03 号会话列表增强）。
 *
 * # 两种"排在上面"要分开
 *
 * - **置顶**：用户手动表达的"这几个我常看"，钉在最上方，不受分组影响
 * - **进行中**：机器从协议 `status` 推断出来的，排在各自分组的第一条
 *
 * 两者视觉上都靠上，但只有前者是用户的决定。所以置顶有独立分区与图标，
 * 拖拽也只重排"手工顺序"那一层，不去动时间分组。
 *
 * 纯逻辑（过滤 / 分组 / 忙碌判定）在 `threadGrouping.ts`，可拖拽行与置顶行
 * 在 `ThreadRows.tsx`——这个文件只管摆位。
 */

import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { ArchiveSection } from './ArchiveSection'
import { DraggableRow, EmptyHint, PinnedRow } from './ThreadRows'
import type { ThreadRowActions } from './ThreadRow'
import type { ThreadSummary } from '../../bridge/types'
import { useShell } from '../../store/shell'
import {
  filterThreads,
  GROUP_LABEL,
  groupThreads,
  type Group,
} from './threadGrouping'
import s from './ThreadList.module.css'

/** 搜索防抖。250ms 是文档定的：短到感觉即时，长到不会每键重排整列。 */
const SEARCH_DEBOUNCE_MS = 250

export interface ThreadListProps extends ThreadRowActions {
  threads: ThreadSummary[]
  archived: ThreadSummary[]
  activeThreadId: string | null
  cwd: string
  busy: boolean
  multi: boolean
  checked: string[]
  showArchived: boolean
  onToggleCheck: (id: string) => void
  onToggleArchived: () => void
  onToggleMulti: () => void
  onOpenWorkspace: () => void
  onNew: () => void
}

export function ThreadList(props: ThreadListProps) {
  const {
    threads,
    archived,
    activeThreadId,
    cwd,
    busy,
    multi,
    checked,
    showArchived,
    onToggleCheck,
    onToggleArchived,
    onToggleMulti,
    onOpenWorkspace,
    onNew,
  } = props

  const togglePin = useShell((s) => s.togglePin)
  const reorderById = useShell((s) => s.reorderById)
  const [query, setQuery] = useState('')
  const [deferred, setDeferred] = useState('')
  // 拖拽源用**会话 id**而不是下标：列表按分组渲染，行下标是组内下标，
  // 不是全局顺序（见 reorderById 的说明）。
  const [dragFrom, setDragFrom] = useState<string | null>(null)

  // 防抖：输入框里立刻变，但过滤用延后 250ms 的值。
  useEffect(() => {
    const timer = window.setTimeout(() => setDeferred(query), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const filtered = useMemo(() => filterThreads(threads, deferred), [threads, deferred])
  const pinned = useMemo(() => filtered.filter((t) => t.pinned), [filtered])
  const rest = useMemo(() => filtered.filter((t) => !t.pinned), [filtered])
  const groups = groupThreads(rest)
  const activeGroups = (Object.keys(GROUP_LABEL) as Group[]).filter((g) => groups[g].length > 0)
  const rows = rowProps(props)

  return (
    <>
      <div className={s.actions}>
        <button
          className={s.newBtn}
          onClick={cwd ? onNew : onOpenWorkspace}
          disabled={busy && Boolean(cwd)}
          title={cwd ? '在当前工作区里新建会话' : '先打开一个工作区'}
        >
          {cwd ? '新建会话' : '打开工作区'}
        </button>
        {!cwd && <p className={s.emptyHint}>会话按文件夹分开。先在顶栏选一个工作区。</p>}
      </div>

      {/* 搜索框只在会话多起来时出现：6 个会话以内翻一下比打字快 */}
      {threads.length > 6 && (
        <div className={s.searchRow}>
          <input
            className={s.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话标题"
            aria-label="搜索会话"
          />
          {query !== deferred && <span className={s.searching}>筛选中…</span>}
        </div>
      )}

      {pinned.length > 0 && (
        <section className={s.pinned}>
          <h3 className={s.pinnedHead}>置顶</h3>
          <ul>
            {pinned.map((thread) => (
              <PinnedRow
                key={thread.id}
                thread={thread}
                active={thread.id === activeThreadId}
                multi={multi}
                checked={checked.includes(thread.id)}
                onToggleCheck={onToggleCheck}
                onUnpin={() => togglePin(thread.id)}
                onDrop={() => {
                  if (dragFrom !== null) reorderById(dragFrom, thread.id)
                  setDragFrom(null)
                }}
                onDragStart={() => setDragFrom(thread.id)}
                {...rows}
              />
            ))}
          </ul>
        </section>
      )}

      <div className={s.section}>
        <div className={s.sectionHead}>
          <span>会话{cwd ? '' : '（全部）'}</span>
          <span className={s.sectionOps}>
            <span className={s.count}>{threads.length}</span>
            {threads.length > 0 && (
              <button className={clsx(s.linkBtn, multi && s.on)} onClick={onToggleMulti}>
                {multi ? '取消多选' : '多选'}
              </button>
            )}
          </span>
        </div>

        {threads.length === 0 ? (
          <EmptyHint cwd={cwd} onOpenWorkspace={onOpenWorkspace} />
        ) : filtered.length === 0 ? (
          <p className={s.emptyHint}>没有匹配「{deferred}」的会话。</p>
        ) : (
          activeGroups.map((group) => (
            <section key={group} className={s.group}>
              <h3 className={s.groupHead}>{GROUP_LABEL[group]}</h3>
              <ul>
                {groups[group].map((thread) => (
                  <DraggableRow
                    key={thread.id}
                    thread={thread}
                    active={thread.id === activeThreadId}
                    multi={multi}
                    checked={checked.includes(thread.id)}
                    dragging={dragFrom === thread.id}
                    onDragStart={() => setDragFrom(thread.id)}
                    onDrop={() => {
                      if (dragFrom !== null && dragFrom !== thread.id) {
                        reorderById(dragFrom, thread.id)
                      }
                      setDragFrom(null)
                    }}
                    onToggleCheck={onToggleCheck}
                    {...rows}
                  />
                ))}
              </ul>
            </section>
          ))
        )}

        <ArchiveSection
          archived={archived}
          activeThreadId={activeThreadId}
          multi={multi}
          checked={checked}
          open={showArchived}
          onToggle={onToggleArchived}
          onToggleCheck={onToggleCheck}
          {...rows}
        />
      </div>
    </>
  )
}

/** 只把 ThreadRow 真正要的回调挑出来——其余 props 别透传下去。 */
function rowProps(props: ThreadListProps): ThreadRowActions {
  return {
    onResume: props.onResume,
    onArchive: props.onArchive,
    onUnarchive: props.onUnarchive,
    onDelete: props.onDelete,
    onRename: props.onRename,
    onCompact: props.onCompact,
    onFork: props.onFork,
    onPin: props.onPin,
  }
}
