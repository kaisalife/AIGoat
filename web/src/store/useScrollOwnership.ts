/**
 * 滚动所有权（04 §3.2）。
 *
 * 消息流有两种互斥的读法：**跟随尾部**（Agent 正在跑）和**自由阅读**
 * （用户翻历史）。切换必须显式，否则会出现最招人烦的那种行为——用户往上看
 * 时被强行拽回底部，或者反过来该跟随时不跟。
 *
 * 判定用「距底 40px」而不是「是否严格在底部」：流式输出每加一行高度都在变，
 * 严格相等几乎永远不成立，跟随会时断时续。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** 距底小于这个距离就算「贴着底部」。 */
const FOLLOW_THRESHOLD = 40

/** 滚动事件 RAF 节流：避免高频 getBoundingClientRect 造成 forced reflow。 */
function rafThrottle<T extends (...args: unknown[]) => void>(fn: T): T {
  let raf = 0
  return ((...args: unknown[]) => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      fn(...args)
    })
  }) as T
}

export interface ScrollOwnership {
  /** 挂到滚动容器上（ref 回调，容器换节点也不会丢）。 */
  ref: (node: HTMLDivElement | null) => void
  /** 当前是否跟随尾部。界面上据此显示「回到底部」按钮。 */
  following: boolean
  /** 主动回到底部并恢复跟随。 */
  scrollToBottom: () => void
  /**
   * 内容变化后调一次。跟随中滚到底，阅读中**一个字都不动**。
   * 由组件在 useLayoutEffect 里调用——必须 layout 阶段，滚动与内容插入
   * 要在同一帧完成，否则会看到跳动。
   */
  sync: () => void
  /** 绑到容器的 onScroll。 */
  onScroll: () => void
}

export function useScrollOwnership(resetKey: string | null): ScrollOwnership {
  const el = useRef<HTMLDivElement | null>(null)
  /** 放 ref 里而不是 state：滚动事件每帧都可能触发，不该引起重渲染。 */
  const stick = useRef(true)
  const [following, setFollowing] = useState(true)

  const ref = useCallback((node: HTMLDivElement | null) => {
    el.current = node
  }, [])

  const onScroll = useCallback(
    rafThrottle(() => {
      const node = el.current
      if (!node) return
      const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < FOLLOW_THRESHOLD
      stick.current = nearBottom
      setFollowing((prev) => (prev === nearBottom ? prev : nearBottom))
    }),
    [],
  )

  const scrollToBottom = useCallback(() => {
    const node = el.current
    if (!node) return
    stick.current = true
    setFollowing(true)
    node.scrollTop = node.scrollHeight
  }, [])

  const sync = useCallback(() => {
    const node = el.current
    if (node && stick.current) node.scrollTop = node.scrollHeight
  }, [])

  // 换会话：回到跟随尾部。
  useEffect(() => {
    stick.current = true
    setFollowing(true)
    el.current?.scrollTo({ top: el.current.scrollHeight })
  }, [resetKey])

  // 首次挂载强制贴底，不受 sticky 初值之外的时机影响。
  useLayoutEffect(sync, [resetKey, sync])

  return { ref, following, scrollToBottom, sync, onScroll }
}