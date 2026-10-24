import { formatSize, useDrafts, type DraftImage } from '../../store/drafts'
import { Button, Tooltip } from '../primitives'
import s from './DraftTray.module.css'

/**
 * composer 上方的附件草稿轨（11 号板块 §3.1，抄 dsh 的 draft tray）。
 *
 * # 缩略图队列而不是文件列表
 *
 * 用户拖进来的通常是"看一眼对不对"，不是"确认文件名对不对"。
 * 队列形态（横向缩略图）让他一眼扫完，竖排列表反而要逐行读文件名。
 *
 * # 发送后清空
 *
 * 草稿是一次性的：发出去就成了消息的一部分，留在轨上会让人以为还能
 * 再发一次同样的图。清空在发送**成功**之后做——失败时图片还在，
 * 用户可以直接重试。
 */
export function DraftTray() {
  const drafts = useDrafts((s) => s.drafts)
  const rejected = useDrafts((s) => s.rejected)
  const remove = useDrafts((s) => s.remove)
  const clearRejected = useDrafts((s) => s.clearRejected)

  if (drafts.length === 0 && rejected.length === 0) return null

  return (
    <div className={s.tray}>
      {drafts.length > 0 && (
        <div className={s.strip}>
          {drafts.map((draft) => (
            <Thumb key={draft.id} draft={draft} onRemove={() => remove(draft.id)} />
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <div className={s.rejected}>
          <div className={s.rejectedList}>
            {rejected.slice(-3).map((r) => (
              <p key={r.path} className={s.rejectedItem}>
                <code className={s.rejectedName}>{shortName(r.path)}</code>：{r.reason}
              </p>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={clearRejected}>
            知道了
          </Button>
        </div>
      )}
    </div>
  )
}

function Thumb({ draft, onRemove }: { draft: DraftImage; onRemove: () => void }) {
  return (
    <figure className={s.thumb}>
      {draft.preview ? (
        <img className={s.image} src={draft.preview} alt={draft.name} />
      ) : (
        // 预览读不出来时给个占位而不是碎图——SVG 可能有外部引用而读不到。
        <span className={s.placeholder} aria-hidden="true">
          🖼
        </span>
      )}
      <button
        type="button"
        className={s.remove}
        aria-label={`移除 ${draft.name}`}
        onClick={onRemove}
      >
        ×
      </button>
      <figcaption className={s.caption}>
        <Tooltip content={`${draft.name} · ${formatSize(draft.size)}`}>
          <span className="truncate">{draft.name}</span>
        </Tooltip>
      </figcaption>
    </figure>
  )
}

function shortName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i >= 0 ? path.slice(i + 1) : path
}