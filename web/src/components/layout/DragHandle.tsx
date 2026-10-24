import { useCallback, useEffect, useRef } from 'react'
import clsx from 'clsx'
import s from './DragHandle.module.css'

export interface DragHandleProps {
  /** 拖拽影响哪一侧：left = 左栏宽，right = 右栏宽。 */
  side: 'left' | 'right'
  onDelta: (delta: number) => void
  /** 拖拽结束（松手或丢失捕获）：落盘时机。 */
  onCommit: () => void
  label: string
  /** 当前宽度与范围：键盘调宽要用，也作为 separator 的可访问性值。 */
  value?: number
  min?: number
  max?: number
  className?: string
}

/** 方向键每次调宽的步长（像素）；按住 Shift 用大步。 */
const KEY_STEP = 12
const KEY_STEP_LARGE = 48

/**
 * 列宽拖拽把手（抄 dsh `DragHandle`：pointer capture + rAF 节流）。
 *
 * 两处关键语义照抄，别改：
 * 1. **pointer capture**——指针移出把手甚至移出窗口，事件仍落在它身上，
 *    否则拖到边缘就「丢鼠标」了。
 * 2. **rAF 节流**——只在下一帧报一次累计位移。pointermove 的频率跟着
 *    显示器刷新率走（120/144Hz），每事件都 setState 会白白触发两倍渲染。
 *
 * `onLostPointerCapture` 也当结束处理：窗口被切走时 capture 会丢，
 * 那时若不收尾，界面会一直停在拖拽中的样式上。
 *
 * 除了鼠标拖拽，还支持**方向键**调宽：它是 `role="separator"` + `tabIndex`，
 * 可聚焦却没有任何键盘处理的话，键盘用户能 Tab 到它却调不动宽度。
 * 方向键的符号与鼠标一致（往右 = 把手右移，左栏变宽 / 右栏变窄）。
 */
export function DragHandle({
  side,
  onDelta,
  onCommit,
  label,
  value,
  min,
  max,
  className,
}: DragHandleProps) {
  const state = useRef({ pointerId: -1, lastX: 0, pending: 0, frame: 0 })

  const flush = useCallback(() => {
    const s0 = state.current
    s0.frame = 0
    if (s0.pending === 0) return
    onDelta(s0.pending)
    s0.pending = 0
  }, [onDelta])

  const finish = useCallback(() => {
    const s0 = state.current
    if (s0.frame) cancelAnimationFrame(s0.frame)
    flush()
    if (s0.pointerId >= 0) s0.pointerId = -1
    document.body.removeAttribute('data-dragging')
    onCommit()
  }, [flush, onCommit])

  useEffect(() => finish, [finish])

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={clsx(s.handle, s[side], className)}
      data-dragging={state.current.pointerId >= 0 || undefined}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP
        onDelta(e.key === 'ArrowLeft' ? -step : step)
      }}
      onKeyUp={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onCommit()
      }}
      onPointerDown={(e) => {
        e.preventDefault()
        const s0 = state.current
        s0.pointerId = e.pointerId
        s0.lastX = e.clientX
        s0.pending = 0
        e.currentTarget.setPointerCapture(e.pointerId)
        document.body.dataset['dragging'] = side
        // 状态在 ref 上，data 属性要手动同步一次（首帧还没发生过 setState）
        e.currentTarget.dataset['dragging'] = 'true'
      }}
      onPointerMove={(e) => {
        const s0 = state.current
        if (s0.pointerId !== e.pointerId) return
        s0.pending += e.clientX - s0.lastX
        s0.lastX = e.clientX
        if (!s0.frame) s0.frame = requestAnimationFrame(flush)
      }}
      onPointerUp={finish}
      onLostPointerCapture={finish}
    />
  )
}