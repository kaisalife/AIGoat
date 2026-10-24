import {
  cloneElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { MenuSurface, type MenuGroupSpec, type MenuItemSpec } from './MenuSurface'
import { useAnchoredPosition } from './useAnchoredPosition'
import { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer'
import { observeComposition } from './keyboardComposition'

export interface MenuProps {
  /** 触发器；必须能接 ref 与事件。 */
  trigger: ReactElement<Record<string, unknown>>
  groups: MenuGroupSpec[]
  /** 触发器是否处于展开态（决定是否画出选中底色）。 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** 面板宽度提示（minWidth），视口钳制首帧也用它兜底。 */
  width?: number
  /** 面板挂在锚点下方（默认）还是上方（输入框底栏这类贴底的触发器用 top）。 */
  side?: 'bottom' | 'top'
  /** 面板与锚点左缘（start，默认）或右缘（end）对齐。 */
  align?: 'start' | 'end'
  /**
   * 打开方式：左键点击（默认）或**右键上下文菜单**。右键模式下左键行为
   * 原样保留（文件树行左键还是打开文件，右键才出菜单）。
   */
  openOn?: 'click' | 'contextmenu'
  children?: ReactNode
}

/** 未定位的 portal 面板：隐藏但参与布局，offsetWidth/offsetHeight 才是真实值。 */
const MEASURE_STYLE: CSSProperties = { visibility: 'hidden', left: 0, top: 0 }

/**
 * 下拉菜单：触发器 + 面板 + 键盘（组合方式对齐 dsh 的 Menu）。
 *
 * 定位走 `useAnchoredPosition`：面板**隐藏挂载**、同一 commit 里量实测
 * 尺寸、按 side/align 摆位后钳进视口——贴屏幕底缘/右缘的触发器（composer
 * 底栏的审批切换、dock 的「+」）不会再把面板探出屏幕。
 *
 * 键盘只有必要的三组键：↑/↓ 移动、Enter/Space 选中、Esc 关闭。
 * 刻意不做首字母跳转和 typeahead——菜单项都很短，收益不抵复杂度。
 */
export function Menu({
  trigger,
  groups,
  open,
  onOpenChange,
  width = 220,
  side = 'bottom',
  align = 'start',
  openOn = 'click',
}: MenuProps) {
  const [uncontrolled, setUncontrolled] = useState(false)
  const isOpen = open ?? uncontrolled
  const [activeId, setActiveId] = useState<string | null>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const anchorRef = useCallback((node: HTMLElement | null) => {
    anchor.current = node
  }, [])
  const listRef = useRef<HTMLDivElement | null>(null)
  const fixedPos = useAnchoredPosition({
    open: isOpen,
    anchorRef: anchor,
    panelRef: listRef,
    side,
    align,
    gap: 4,
    margin: 8,
  })
  const rootRef = useRef<HTMLDivElement | null>(null)

  const setOpen = useCallback(
    (next: boolean) => {
      setUncontrolled(next)
      onOpenChange?.(next)
      if (next) {
        const first = groups.flatMap((g) => g.items).find((i) => !i.disabled)
        setActiveId(first?.id ?? null)
      }
    },
    [groups, onOpenChange],
  )

  // 点击面板之外即关闭（移植 dsh：pointerdown 覆盖触摸/笔，portal 里的
  // 面板也算"在内"，不需要再靠 role=menu 的 DOM 猜测）。
  const close = useCallback(() => setOpen(false), [setOpen])
  useDismissOnOutsidePointer(rootRef, isOpen, close, listRef)

  // IME 组合期守卫：组合中的 Escape/方向键/回车不归菜单管。
  const compositionRef = useRef<ReturnType<typeof observeComposition> | null>(null)
  useEffect(() => {
    const composition = observeComposition(document)
    compositionRef.current = composition
    return () => {
      compositionRef.current = null
      composition.dispose()
    }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (compositionRef.current?.guards(e.nativeEvent)) return
    const flat = groups.flatMap((g) => g.items).filter((i) => !i.disabled)
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      const at = flat.findIndex((i) => i.id === activeId)
      const next = flat[(at + step + flat.length) % flat.length]
      setActiveId(next?.id ?? null)
    } else if (e.key === 'Enter' || e.key === ' ') {
      const item = flat.find((i) => i.id === activeId)
      if (item) {
        e.preventDefault()
        item.onSelect()
        setOpen(false)
      }
    }
  }

  return (
    <div ref={rootRef} onKeyDown={onKeyDown}>
      {cloneElement(trigger, {
        ref: anchorRef,
        'aria-haspopup': 'menu',
        'aria-expanded': isOpen,
        ...(openOn === 'contextmenu'
          ? {
              onContextMenu: (e: React.MouseEvent) => {
                e.preventDefault()
                setOpen(!isOpen)
              },
            }
          : { onClick: () => setOpen(!isOpen) }),
        onKeyDown,
      } as Record<string, unknown>)}
      {isOpen &&
        createPortal(
          <MenuSurface
            ref={listRef}
            style={{ ...(fixedPos ?? MEASURE_STYLE), minWidth: width }}
            groups={groups}
            activeId={activeId}
            onActiveChange={setActiveId}
            onSelect={(item: MenuItemSpec) => {
              item.onSelect()
              setOpen(false)
            }}
          />,
          document.body,
        )}
    </div>
  )
}