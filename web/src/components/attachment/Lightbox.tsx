import { useEffect, useState } from 'react'
import { getClient } from '../../bridge/session'
import { getFileExtension } from '../../shared/getFileExtension'
import { Button, Modal, Spinner } from '../primitives'
import s from './Lightbox.module.css'

export interface LightboxProps {
  /** 图片的本地路径或 data URL。null 时不渲染。 */
  src: string | null
  alt: string
  onClose: () => void
}

/**
 * 灯箱（11 号板块 §3.1，抄 dsh 的 lightbox）。
 *
 * # 原生 `<dialog>` 而不是自己实现焦点陷阱
 *
 * 模态要做的三件事——Esc 关闭、焦点锁在里面、关闭后焦点归还——原生
 * `<dialog>.showModal()` 全都白送。自己实现这三条几乎必然漏一条，而漏掉的
 * 那条正好是键盘用户唯一能感知到的。
 */
export function Lightbox({ src, alt, onClose }: LightboxProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!src) return
    // data URL 直接用；本地路径要读一次（图片附件不经过 base64 传输）。
    if (src.startsWith('data:')) {
      setDataUrl(src)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void getClient()
      .fsRead(src)
      .then((result) => {
        if (cancelled) return
        if (result.kind !== 'image') {
          setError('不是可显示的图片')
          return
        }
        setDataUrl(`data:image/${imageExt(src)};base64,${result.content}`)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [src])

  if (!src) return null

  return (
    <Modal open onClose={onClose} size="full" title={alt} className={s.modal}>
      <div className={s.stage}>
        {loading && <Spinner />}
        {error ? (
          <div className={s.error}>
            <p>无法显示这张图片：{error}</p>
            <Button variant="ghost" onClick={() => void getClient().fsReveal(src)}>
              在资源管理器中打开
            </Button>
          </div>
        ) : (
          dataUrl && <img className={s.image} src={dataUrl} alt={alt} />
        )}
      </div>
    </Modal>
  )
}

function imageExt(path: string): string {
  const ext = getFileExtension(path)
  return ext === 'jpg' ? 'jpeg' : ext || 'png'
}