import { useMemo, useRef } from 'react'
import clsx from 'clsx'
import { useAnchoredMaxHeight } from '../primitives/useAnchoredMaxHeight'
import type { PopupItem } from './TriggerManager'
import s from './TriggerPopup.module.css'

export interface TriggerPopupProps {
  items: PopupItem[]
  cursor: number
  /** 空列表时也要显示（"没有匹配的命令"比"什么都不出现"好）。 */
  onPick: (item: PopupItem) => void
  onDismiss: () => void
  /**
   * 重测信号：输入框随文字长高会把弹层顶高，传一个随之变化的值
   * （composer 传 `text.length`）让 max-height 重新适配。
   */
  signal?: unknown
}

/**
 * 触发弹层：fuzzy 列表 + 分组 sticky 头（08 号板块）。
 *
 * 刻意做成**列表**而不是一块模糊的候选区：`/compact` 这种命令，
 * 用户需要看清"它会做什么"（hint），模糊匹配把 hint 藏起来就等于没提示。
 *
 * 分组头 sticky：命令按「会话/上下文/配置」分段，文件按目录分段；
 * 往下滚时当前段落的头留在顶上，用户才知道自己在看哪一段。
 *
 * 高度用 `useAnchoredMaxHeight` 钳进视口：弹层底边贴输入框顶、向上生长，
 * 小窗口或输入框很高时固定 260px 的设计上限会把顶边推出屏幕（还会压到
 * sticky 的会话头部底下）——钳到「底边到视口顶」的剩余空间，并给 sticky
 * 头留出余量。
 */
export function TriggerPopup(props: TriggerPopupProps) {
  const { items, cursor, onPick, onDismiss, signal } = props
  const sections = useMemo(() => groupBy(items), [items])
  const cursorId = items[cursor]?.id
  const popupRef = useRef<HTMLDivElement | null>(null)
  const maxHeight = useAnchoredMaxHeight(popupRef, 260, signal, 64)

  return (
    <div ref={popupRef} className={s.popup} role="listbox" aria-label="命令与文件" style={{ maxHeight }}>
      {sections.length === 0 && (
        <p className={s.empty}>
          没有匹配项
          <button type="button" className={s.dismiss} onClick={onDismiss}>
            取消
          </button>
        </p>
      )}

      {sections.map((section) => (
        <section key={section.group} className={s.section}>
          <h3 className={s.head}>{section.group}</h3>
          {section.items.map((item) => (
            <button
              key={`${item.kind}:${item.id}`}
              type="button"
              role="option"
              aria-selected={item.id === cursorId}
              className={clsx(s.item, item.id === cursorId && s.active)}
              onClick={() => onPick(item)}
            >
              <span className={s.label}>{item.label}</span>
              {item.hint && <span className={s.hint}>{item.hint}</span>}
            </button>
          ))}
        </section>
      ))}
    </div>
  )
}

/** 按 group 字段分段，保持条目原有顺序（注册表顺序 = 用户预期的顺序）。 */
function groupBy(items: PopupItem[]): { group: string; items: PopupItem[] }[] {
  const map = new Map<string, PopupItem[]>()
  for (const item of items) {
    const bucket = map.get(item.group)
    if (bucket) bucket.push(item)
    else map.set(item.group, [item])
  }
  return [...map].map(([group, list]) => ({ group, items: list }))
}