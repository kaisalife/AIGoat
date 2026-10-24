import { memo, type ReactNode } from 'react'
import type { FileChange } from '../../bridge/types'
import {
  DiffBlock,
  DiffStat,
  parseUnifiedDiff,
  type DiffLine,
} from '../primitives/DiffBlock'

export type { DiffLine }

/**
 * 单个文件的变更卡。
 *
 * 解析与渲染交给 `primitives/DiffBlock`（统一 diff 只有一个实现，
 * Trajectory 侧也是同一份）；这里只负责文件头：路径、类型标记、增删统计。
 *
 * `memo` + 只解析一次：`fileEditPatch` 是**流式**的，每来一批补丁整个
 * `changes` 列表都会重渲染。列表里未变的 `change` 引用是稳定的（reducer
 * 复用），`memo` 于是跳过它们；而统计用到的行只解析一次，顺手传给
 * `DiffBlock`，避免它在内部再解析一遍。
 */
export const DiffView = memo(function DiffView(props: { change: FileChange }) {
  const { change } = props
  const lines = parseUnifiedDiff(change.diff)

  return (
    <div className="diff">
      <header className="diff__head">
        <span className={'diff__mark diff__mark--' + change.kind}>
          {change.kind === 'add' ? '+' : change.kind === 'delete' ? '−' : '~'}
        </span>
        <code className="diff__path truncate" title={change.path}>
          {change.path}
        </code>
        {change.kind === 'update' && change.movePath && (
          <span className="diff__move">→ {change.movePath}</span>
        )}
        <span className="spacer" />
        <DiffStat lines={lines} className="diff__stat" />
      </header>

      <DiffBlock
        diff={change.diff}
        lines={lines}
        className="diff__body"
        empty="（无 diff 内容）"
      />
    </div>
  )
})

/** 回合 diff 流（`turn/diff/updated`）没有文件名，直接整体渲染。 */
export const RawDiff = memo(function RawDiff(props: { diff: string }) {
  const lines = parseUnifiedDiff(props.diff)
  if (lines.length === 0) return null

  return (
    <div className="diff diff--raw">
      <header className="diff__head">
        <span className="diff__mark">≡</span>
        <span className="diff__path">回合 diff</span>
        <span className="spacer" />
        <DiffStat lines={lines} className="diff__stat" />
      </header>
      <DiffBlock diff={props.diff} lines={lines} className="diff__body" />
    </div>
  )
})

export function diffNodes(changes: FileChange[]): ReactNode[] {
  return changes.map((change) => <DiffView key={change.path} change={change} />)
}