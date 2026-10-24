import { useEffect } from 'react'
import { useDrafts } from '../../store/drafts'

/**
 * 订阅 Tauri 的拖放事件。
 *
 * # 为什么必须走 Tauri 而不是 HTML5
 *
 * HTML5 的 `dragover`/`drop` 在 WebView 里只给 `File` 对象、**拿不到路径**；
 * 而协议要的是 `UserInput.localImage.path`。Tauri 的 `onDragDropEvent`
 * 给的是真实文件系统路径——这是整条附件通路的地基。
 *
 * 单独成文件是因为它是**唯一**直接碰 Tauri 窗口 API 的附件代码，
 * 组件只需要知道"现在有没有在拖"。
 *
 * # 清拒收提示
 *
 * 每次 drop 前清上一批的提示：两次拖入的提示叠在一起会让人以为
 * 同一批失败了两次。
 */
export function useDraftDrop(): void {
  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | null = null

    void import('@tauri-apps/api/webview').then(async ({ getCurrentWebview }) => {
      if (cancelled) return
      const stop = await getCurrentWebview().onDragDropEvent((event) => {
        const { setDragging, addPaths, clear } = useDrafts.getState()
        switch (event.payload.type) {
          case 'enter':
            setDragging(true)
            break
          case 'drop':
            setDragging(false)
            clear()
            void addPaths(event.payload.paths)
            break
          case 'leave':
            setDragging(false)
            break
          default:
            // 'over' 只带光标位置，不带路径——拖动过程中每秒能来几十次。
            break
        }
      })
      if (cancelled) {
        void stop()
        return
      }
      unlisten = stop
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}