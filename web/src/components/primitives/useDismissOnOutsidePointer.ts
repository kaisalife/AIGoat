/**
 * 触发器自有弹层的指针点外关闭（移植自 dsh
 * `ui-primitives/useDismissOnOutsidePointer.ts`）。
 */
import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * 弹层打开期间，pointerdown 落在根元素之外就关闭。
 * @param root - 同时包含触发器与打开的表面的元素。
 * @param open - 表面是否打开；false 时摘掉监听。
 * @param setOpen - 外部 pointerdown 时以 false 调用。
 * @param portal - portal 到根之外的表面（挂 document.body 的菜单），
 * 它也算"在内"；根元素已包含整个弹层时省略。
 */
export function useDismissOnOutsidePointer(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: (open: boolean) => void,
  portal?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node
        && root.current?.contains(event.target) !== true
        && portal?.current?.contains(event.target) !== true) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => { document.removeEventListener('pointerdown', closeOutside) }
  }, [root, open, setOpen, portal])
}
