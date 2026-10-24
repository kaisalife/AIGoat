import { useEffect, useState } from 'react'
import type { Window as TauriWindow } from '@tauri-apps/api/window'
import s from './WindowBar.module.css'

/** `@tauri-apps/api/window` 的懒加载单例：非 Tauri 环境（单测）不会触发取值。 */
let winPromise: Promise<TauriWindow> | null = null
function tauriWindow(): Promise<TauriWindow> {
  winPromise ??= import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow())
  return winPromise
}

/** 最小化按钮的字形。 */
function MinGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/** 最大化 / 还原按钮的字形（还原态叠两个矩形）。 */
function MaxGlyph({ maximized }: { maximized: boolean }) {
  return maximized ? (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/**
 * 自绘窗口条（decorations: false 之后窗口的标题栏）。
 *
 * 为什么不用系统装饰：那行原生黑条与深色界面完全脱节，还占掉一整行
 * 视口。这里照 dsh 的 frame 方案自绘——`data-tauri-drag-region` 提供拖动
 * 与双击最大化（Tauri 注入脚本处理），三个按钮经 Window API 收缩/还原/
 * 关闭；高度同时写进 `--ag-frame-top-clearance`，浮层据此避开窗口条。
 */
export function WindowBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null
    void tauriWindow().then(async (w) => {
      setMaximized(await w.isMaximized())
      const stop = await w.onResized(async () => {
        setMaximized(await w.isMaximized())
      })
      if (disposed) {
        await stop()
        return
      }
      unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  const minimize = (): void => {
    void tauriWindow().then((w) => w.minimize())
  }
  const toggleMaximize = (): void => {
    void tauriWindow().then((w) => w.toggleMaximize())
  }
  const close = (): void => {
    void tauriWindow().then((w) => w.close())
  }

  return (
    <div className={s.bar} data-tauri-drag-region>
      <span className={s.brand} data-tauri-drag-region>
        AIGoat
      </span>
      <span className={s.spacer} data-tauri-drag-region />
      <button type="button" className={s.btn} aria-label="最小化" onClick={minimize}>
        <MinGlyph />
      </button>
      <button
        type="button"
        className={s.btn}
        aria-label={maximized ? '向下还原' : '最大化'}
        onClick={toggleMaximize}
      >
        <MaxGlyph maximized={maximized} />
      </button>
      <button type="button" className={`${s.btn} ${s.close}`} aria-label="关闭" onClick={close}>
        <CloseGlyph />
      </button>
    </div>
  )
}
