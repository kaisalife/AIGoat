import { useEffect, useState } from 'react'
import { getClient } from '../../bridge/session'
import { getFileExtension } from '../../shared/getFileExtension'
import { Lightbox } from '../attachment/Lightbox'
import { CardShell } from './CardShell'
import { StateDot } from '../primitives'
import type { ImageGenerationEntry, ImageViewEntry } from '../../store/entries'
import s from './ImageCards.module.css'

/**
 * `imageView` 卡片（11 号板块 §3.3）。
 *
 * 协议事件在 C 期就映射了，但 reducer 之前没有 case —— 这两个事件一直是
 * **静默丢弃**的：模型读了图、显示了图，界面上什么都不出现。这一期补上。
 */
export function ImageViewCard({ entry }: { entry: ImageViewEntry }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <figure className={s.view}>
        <button type="button" className={s.thumb} onClick={() => setOpen(true)}>
          <LocalImage path={entry.path} alt={fileName(entry.path)} />
          <span className={s.zoom}>放大</span>
        </button>
        <figcaption className={s.caption} title={entry.path}>
          {fileName(entry.path)}
        </figcaption>
      </figure>
      <Lightbox
        src={open ? entry.path : null}
        alt={fileName(entry.path)}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

/**
 * `imageGeneration` 卡片（11 号板块 §3.3）。
 *
 * 三态：生成中 / 完成 / 失败。**失败态要显示原因**——生成失败最常见的是
 * 配额或提示词被拒，只写一个"失败"用户没法判断该不该重试。
 */
export function ImageGenerationCard({ entry }: { entry: ImageGenerationEntry }) {
  const [open, setOpen] = useState(false)
  const running = entry.status === 'inProgress'
  const failed = entry.status === 'failed'
  const output = entry.savedPath ?? entry.result ?? null

  return (
    <>
      <CardShell
        summary={entry.revisedPrompt ? truncate(entry.revisedPrompt) : '生成图片'}
        badge="生成"
        running={running}
        tone={failed ? 'danger' : running ? 'accent' : 'success'}
        locked={running}
        meta={
          !running ? (
            <span className="card__status">
              <StateDot tone={failed ? 'danger' : 'success'} size={6} />
              {failed ? '失败' : '完成'}
            </span>
          ) : null
        }
      >
        {failed ? (
          <p className={s.reason}>
            {(entry.failure as { message?: string } | undefined)?.message ?? '未提供原因'}
          </p>
        ) : output ? (
          <button type="button" className={s.thumb} onClick={() => setOpen(true)}>
            <LocalImage path={output} alt={fileName(output)} />
          </button>
        ) : (
          <p className="card__empty">生成完成，但产物没有可显示的路径。</p>
        )}
      </CardShell>
      <Lightbox
        src={open ? output : null}
        alt={entry.revisedPrompt ?? '生成的图片'}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

/**
 * 图片本体。
 *
 * 协议给的是**本地路径**（`savedPath` / `path`）而不是 base64，所以要读一次。
 * 读失败给占位而不是碎图图标——SVG 可能有外部引用，转成 data URL 一样读不出。
 */
function LocalImage({ path, alt }: { path: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    setFailed(false)
    void getClient()
      .fsRead(path)
      .then((result) => {
        if (cancelled) return
        if (result.kind !== 'image') {
          setFailed(true)
          return
        }
        setSrc(`data:image/${imageExt(path)};base64,${result.content}`)
      })
      .catch((err) => {
        console.error('[ImageCards] 加载失败:', err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  if (failed) return <span className={s.broken}>🖼 无法预览</span>
  if (!src) return <span className={s.loading}>读取中…</span>
  return <img className={s.image} src={src} alt={alt} />
}

function imageExt(path: string): string {
  const ext = getFileExtension(path)
  return ext === 'jpg' ? 'jpeg' : ext || 'png'
}

function fileName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i >= 0 ? path.slice(i + 1) : path
}

function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}