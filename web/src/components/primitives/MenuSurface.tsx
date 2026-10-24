import { forwardRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import clsx from 'clsx'
import s from './MenuSurface.module.css'

export interface MenuItemSpec {
  id: string
  label: ReactNode
  /** 右侧灰字（快捷键、当前值）。 */
  hint?: string
  /** 危险操作用 danger（删除、注销），默认用中性色。 */
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

export interface MenuGroupSpec {
  /** 分组标题；省略就是无标题的一组。 */
  label?: string
  items: MenuItemSpec[]
}

export interface MenuSurfaceProps {
  groups: MenuGroupSpec[]
  /** 键盘高亮的项 id；受控——上下键与鼠标悬停都写回这里。 */
  activeId: string | null
  onActiveChange: (id: string) => void
  onSelect: (item: MenuItemSpec) => void
  className?: string
  /** 定位样式由 Menu 传入（`useAnchoredPosition` 的产物或隐藏测量态）。 */
  style?: CSSProperties
}

/**
 * 菜单面板本体（dsh 的 MenuSurface）。
 *
 * 只管渲染、外观与高亮；fixed 定位由皮肤样式承担、坐标由 `useAnchoredPosition`
 * 经 `Menu` 传入，开关与键盘交给 `Menu`——三件事分开之后，右栏 dock 的标签
 * 页菜单、顶栏下拉和审批模式切换能共用同一个面板。
 */
export const MenuSurface = forwardRef<HTMLDivElement, MenuSurfaceProps>(function MenuSurface(
  { groups, activeId, onActiveChange, onSelect, className, style },
  ref,
) {
  return (
    <div ref={ref} className={clsx(s.surface, className)} style={style} role="menu">
      {groups.map((group, gi) => (
        <div key={group.label ?? gi} className={s.group}>
          {group.label && <div className={s.groupLabel}>{group.label}</div>}
          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={clsx(
                s.item,
                item.danger && s.danger,
                item.disabled && s.disabled,
                activeId === item.id && s.active,
              )}
              disabled={item.disabled}
              // mousedown 先于 blur 触发：点它来选中，面板才不会先被失焦关掉
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(item)
              }}
              onMouseEnter={() => onActiveChange(item.id)}
            >
              <span className={s.itemLabel}>{item.label}</span>
              {item.hint && <span className={s.hint}>{item.hint}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
})
