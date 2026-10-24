/**
 * 置顶区与可拖拽行（03 号会话列表增强）。
 *
 * 单独成文件是因为它们与列表主体**结构不同**：主体是「时间分组 + 渲染行」，
 * 这里��「用户手动排序 + 置顶」——两套交互模型（拖拽 vs 单击）混在一个文件里
 * 时，读的人要先分清哪段属于哪套。
 *
 * 拖拽只在**未搜索**时启用：搜索结果是一个临时视图，在它里面重排会把用户
 * 搞不懂的顺序写进设置里。
 */

import clsx from 'clsx'
import { ThreadRow, type ThreadRowActions } from './ThreadRow'
import type { ThreadSummary } from '../../bridge/types'
import s from './ThreadList.module.css'

/** 置顶区：一行置顶会话 + 取消置顶按钮。 */
export function PinnedRow(props: {
  thread: ThreadSummary
  active: boolean
  multi: boolean
  checked: boolean
  onUnpin: () => void
  onDrop: () => void
  onDragStart: () => void
  onToggleCheck: (id: string) => void
} & ThreadRowActions) {
  const { onUnpin, onDrop, onDragStart, thread, multi, ...rest } = props
  return (
    <li
      className={s.pinnedItem}
      draggable={!multi}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <ThreadRow {...rest} thread={thread} draggable={!multi} />
      <button className={s.unpin} onClick={onUnpin} aria-label="取消置顶" title="取消置顶">
        ★
      </button>
    </li>
  )
}

/** 普通分组里的一行：整行可拖拽重排。 */
export function DraggableRow(props: {
  thread: ThreadSummary
  active: boolean
  multi: boolean
  checked: boolean
  dragging: boolean
  onDragStart: () => void
  onDrop: () => void
  onToggleCheck: (id: string) => void
} & ThreadRowActions) {
  return (
    <li
      className={clsx(s.dragItem, props.dragging && s.dragging)}
      draggable={!props.multi}
      onDragStart={props.onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={props.onDrop}
      onDragEnd={props.onDrop}
    >
      <ThreadRow
        {...props}
        thread={props.thread}
        active={props.active}
        multi={props.multi}
        checked={props.checked}
        onToggleCheck={props.onToggleCheck}
        draggable={!props.multi}
      />
    </li>
  )
}
/**
 * 没有会话时的引导。有工作区与没有，说的话不一样——"点新建"和
 * "先去选个工作区"是完全不同的下一步。
 */
export function EmptyHint({ cwd, onOpenWorkspace }: { cwd: string; onOpenWorkspace: () => void }) {
  return (
    <p className={s.emptyHint}>
      {cwd ? (
        <>
          这个工作区还没有会话。
          <br />
          点「新建会话」开始。
        </>
      ) : (
        <>
          还没有打开工作区。
          <br />
          <button className={s.linkBtn} onClick={onOpenWorkspace}>
            打开一个文件夹
          </button>
        </>
      )}
    </p>
  )
}