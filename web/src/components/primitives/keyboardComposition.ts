/**
 * 本地键盘处理器的组合输入（IME）生命周期（移植自 dsh
 * `ui-primitives/keyboard-composition.ts`）。
 *
 * 中文输入法确认候选时会派发一个 `isComposing` 已经为 false 的**迟到
 * keydown**，部分引擎还会用 keyCode 229 代替组合态——只看 `isComposing`
 * 会把「确认候选」的回车当成「发送」。这里把组合期、结束后的第一次
 * keydown、229 三种信号统一成一个守卫。
 */

/**
 * 观察组合输入直到其收尾键被松开或被消费。
 * @param document - 调用方所属的 document。
 * @returns 事件守卫与全部监听器的清理函数。
 */
export function observeComposition(document: Document): {
  guards(event: KeyboardEvent): boolean
  dispose(): void
} {
  let composing = false
  let ended = false
  const start = (): void => { composing = true }
  const end = (): void => { composing = false; ended = true }
  const release = (): void => { ended = false }
  const blur = (): void => { composing = false; ended = false }
  document.addEventListener('compositionstart', start, true)
  document.addEventListener('compositionend', end, true)
  document.addEventListener('keyup', release, true)
  document.defaultView?.addEventListener('blur', blur)
  return {
    guards: (event) => {
      // keyCode 229 兜那些不设 isComposing 的引擎。
      const guarded = composing || ended || event.isComposing || event.keyCode === 229
      ended = false
      return guarded
    },
    dispose: () => {
      document.removeEventListener('compositionstart', start, true)
      document.removeEventListener('compositionend', end, true)
      document.removeEventListener('keyup', release, true)
      document.defaultView?.removeEventListener('blur', blur)
    },
  }
}
