/**
 * 宿主剪贴板写入，Web 复制控件共用（移植自 dsh `ui-primitives/clipboard.ts`）。
 * 成功反馈归各控件；这里只报告宿主是否接受了写入。
 */

/**
 * 把文本写入宿主剪贴板，优先异步 Clipboard API，宿主缺失（jsdom、非安全
 * 上下文）时回退 `execCommand('copy')`。
 * @param text - 要写入的确切文本。
 * @returns 仅当宿主接受写入时为 true。
 */
export async function writeClipboard(text: string): Promise<boolean> {
  // lib.dom 把 clipboard 类型写成必有，但非安全上下文运行时就是没有——
  // 这个守卫检测的正是这个缺口。
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 权限被拒 / iframe 策略——不得谎报成功。
      return false
    }
  }
  // jsdom 与旧宿主：有 execCommand 就尽力回退。
  const exec = typeof document.execCommand === 'function'
    ? document.execCommand.bind(document)
    : undefined
  if (exec === undefined) return false
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.left = '-9999px'
  document.body.appendChild(el)
  el.select()
  try {
    return exec('copy')
  } catch {
    return false
  } finally {
    el.remove()
  }
}
