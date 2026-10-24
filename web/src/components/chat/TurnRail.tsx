import type { TurnMeta } from '../../store/turnState'
import s from './TurnRail.module.css'

export interface TurnRailProps {
  turns: TurnMeta[]
  /** 高亮哪一轮：运行中的那一轮（没有则最近一轮）。 */
  activeTurn: number | null
  /** 点某一轮 → 滚到它的位置。 */
  onNavigate: (turn: number) => void
}

/**
 * 回合导航条（04 §3.2，移植 dsh `TurnNavigator` 的交互意图）。
 *
 * 长会话里回合之间默认折叠成一行，想回到某一轮得一路滚。这条细轨给每一轮
 * 一个刻度：**按状态着色**、悬停出该轮的首条提问预览、点一下滚过去。
 *
 * 与 dsh 同名组件的取舍差异：dsh 用虚拟化 + 固定节距渲染**每一轮**（含尚未
 * 加载、点击再翻页的"未加载"刻度）；AIGoat 的回合都在内存里（几十个量级），
 * 一条 `flex` 竖列即可，不引入 UI 依赖。
 *
 * 少于两轮不显示：只有一个刻度的轨纯属噪音。
 */
export function TurnRail({ turns, activeTurn, onNavigate }: TurnRailProps) {
  if (turns.length < 2) return null

  // 方向键在刻度间移动焦点（dsh 的导轨同样可键盘走）。Tab 也能进出，
  // 但一列几十个刻度用 Tab 逐个跳太慢，方向键才是这一列的用法。
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const marks = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
    if (marks.length === 0) return
    const at = marks.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    marks[(at + step + marks.length) % marks.length]?.focus()
  }

  return (
    <nav className={s.rail} aria-label="回合导航" onKeyDown={onKeyDown}>
      {turns.map((turn) => {
        const label = turn.preview ? `回合 ${turn.index + 1}：${turn.preview}` : `回合 ${turn.index + 1}`
        return (
          <button
            key={turn.index}
            type="button"
            className={s.mark}
            data-status={turn.status}
            data-active={turn.index === activeTurn || undefined}
            aria-label={label}
            aria-current={turn.index === activeTurn ? 'true' : undefined}
            title={label}
            onClick={() => onNavigate(turn.index)}
          />
        )
      })}
    </nav>
  )
}
