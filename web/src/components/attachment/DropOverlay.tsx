import { useDrafts } from '../../store/drafts'
import { useDraftDrop } from './useDraftDrop'
import s from './DropOverlay.module.css'

/**
 * 全屏拖放邀请态（11 号板块 §3.1，抄 dsh 的 drop overlay）。
 *
 * # 事件来自 Tauri 而不是 HTML5
 *
 * HTML5 的 `dragover`/`drop` 在 WebView 里只给 `File` 对象、**没有路径**；
 * 而协议要的就是 `localImage.path`。Tauri 的 `onDragDropEvent` 给的是
 * 真实文件系统路径，所以必须走那条通道（见 `useDraftDrop`）。
 *
 * 拖进来的路径可能指向 codex 读得到、浏览器读不到的位置。草稿轨会自己
 * 探一次（`fs_read`），探不到就显示占位图——**不假成功**。
 */
export function DropOverlay() {
  const dragging = useDrafts((st) => st.dragging)
  useDraftDrop()

  if (!dragging) return null
  return (
    <div className={s.overlay} aria-hidden="true">
      <div className={s.card}>
        <span className={s.glyph}>⤓</span>
        <span className={s.text}>松手把图片加进这一条消息</span>
        <span className={s.hint}>支持 png / jpg / gif / webp / bmp / svg，单张 ≤20MB</span>
      </div>
    </div>
  )
}