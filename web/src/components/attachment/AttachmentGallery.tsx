import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { getClient } from '../../bridge/session'
import { Lightbox } from '../attachment/Lightbox'
import { Button, Spinner, StateDot } from '../primitives'
import { useShell } from '../../store/shell'
import s from './AttachmentGallery.module.css'

interface Attachment {
  id: string
  identityKey: string
  type: string
  /** 附件的本地路径或引用。协议给的是 `payload`，形状随 type 变。 */
  path: string
}

/**
 * 会话历史附件画廊（11 号板块 §3.1，右栏 tab）。
 *
 * # 数据源是 `thread/attachment/list`
 *
 * 实时流**没有**附件事件（`thread/attachment/updated` 只在别的客户端改动时
 * 才来），所以这个 tab 打开时拉一次、之后靠刷新按钮。不订阅事件——
 * 订阅一个"大多数时候不响"的通道不值当。
 *
 * # `payload` 逐 type 解析
 *
 * 协议核实过：payload 是 `JsonValue`，形状由 `attachmentType` 决定
 * （docs/17 §5.1）。所以这里对每种 type 各认一个字段名，认不出就显示
 * 类型名而不是假装有图。
 */
export function AttachmentGallery() {
  const threadId = useShell((s) => s.activeThreadId)
  const [items, setItems] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Attachment | null>(null)

  useEffect(() => {
    if (!threadId) return
    let cancelled = false
    setLoading(true)
    void getClient()
      .attachmentList(threadId, { limit: 100 })
      .then((res) => {
        if (!cancelled) setItems(res.attachments.map(toAttachment).filter(Boolean) as Attachment[])
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
  }, [threadId])

  if (!threadId) return <p className={s.empty}>先打开一个会话。</p>
  if (loading) return <div className={s.center}><Spinner /></div>

  return (
    <div className={s.pane}>
      <header className={s.head}>
        <span>历史附件（{items.length}）</span>
        <Button variant="ghost" size="sm" onClick={() => void reload(threadId, setItems, setLoading)}>
          刷新
        </Button>
      </header>

      {error && <p className={s.error}>{error}</p>}
      {items.length === 0 && !error && (
        <p className={s.empty}>这个会话还没有附件。往消息里拖张图片试试。</p>
      )}

      <div className={s.grid}>
        {items.map((item) => (
          <figure key={item.identityKey} className={s.cell}>
            <button
              type="button"
              className={s.thumb}
              onClick={() => setOpen(item)}
              title={item.path}
            >
              {isImage(item) ? (
                <img className={s.image} src={`file:///${item.path.replace(/\\/g, '/')}`} alt={item.id} />
              ) : (
                <span className={s.other}>
                  <StateDot tone="neutral" size={6} />
                  {item.type}
                </span>
              )}
            </button>
            <figcaption className={s.caption} title={item.path}>
              {item.id}
            </figcaption>
          </figure>
        ))}
      </div>

      <Lightbox
        src={open?.path ?? null}
        alt={open?.id ?? ''}
        onClose={() => setOpen(null)}
      />
    </div>
  )
}

async function reload(
  threadId: string,
  setItems: (items: Attachment[]) => void,
  setLoading: (loading: boolean) => void,
): Promise<void> {
  setLoading(true)
  try {
    const res = await getClient().attachmentList(threadId, { limit: 100 })
    setItems(res.attachments.map(toAttachment).filter(Boolean) as Attachment[])
  } finally {
    setLoading(false)
  }
}

/**
 * 协议附件 → 界面附件。
 *
 * `payload` 的字段名随 type 变，这里只认已知的那几个；认不出时仍然返回
 * 一条记录（显示类型名），而不是把它丢掉——附件存在这件事本身就有信息量。
 */
function toAttachment(raw: unknown): Attachment | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  const id = a['id']
  if (typeof id !== 'string') return null
  const payload = (a['payload'] ?? {}) as Record<string, unknown>
  const path =
    typeof payload['path'] === 'string'
      ? payload['path']
      : typeof payload['url'] === 'string'
        ? payload['url']
        : ''
  return {
    id,
    identityKey: String(a['identityKey'] ?? id),
    type: String(a['type'] ?? 'unknown'),
    path,
  }
}

function isImage(item: Attachment): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(item.path) || item.type.includes('image')
}

/** 单元格等宽，网格才不会因文件名长短而参差。 */
export function cellClass(active: boolean): string {
  return clsx(s.cell, active && 'is-active')
}