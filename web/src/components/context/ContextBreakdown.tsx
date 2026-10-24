import { Pill } from '../primitives'
import s from './ContextBreakdown.module.css'

export interface ContextBreakdownProps {
  input: number
  cached: number
  output: number
  reasoning: number
  limit: number
  onClose: () => void
}

/**
 * 展开的 token 明细（13 号板块）。
 *
 * # 为什么不显示 system / tools / messages 三段
 *
 * dsh 那个三段分布需要服务端给出分段计数，而 codex 的 `tokenUsage` 只有
 * 总量四值（input/output/cached/limit）。13 号文件把这条定为**设计红线**：
 * 不虚构 breakdown。所以这里就显示我们真有的四个数，并把限制写在界面上——
 * 用户看到的每个数都是真的，缺的那部分说清楚缺在哪。
 *
 * # 缓存单独一行
 *
 * `cached` 是 input 的子集（命中缓存的部分）。混在 input 里会让人以为
 * 每轮都要全额计费，所以单列并给命中率。
 */
export function ContextBreakdown(props: ContextBreakdownProps) {
  const { input, cached, output, reasoning, limit, onClose } = props
  const ownInput = Math.max(0, input - cached)
  const hitRate = input > 0 ? Math.round((cached / input) * 100) : null
  const known = limit > 0

  return (
    <div className={s.panel}>
      <header className={s.head}>
        <span className={s.title}>上下文明细</span>
        <span className="spacer" />
        <button type="button" className={s.close} onClick={onClose} aria-label="收起明细">
          ×
        </button>
      </header>

      <dl className={s.kv}>
        <dt>输入（未命中缓存）</dt>
        <dd>{ownInput}</dd>

        <dt>输入（命中缓存）</dt>
        <dd>
          {cached}
          {hitRate !== null && (
            <span className={s.rate} title="缓存命中的部分不重复计费">
              {hitRate}%
            </span>
          )}
        </dd>

        <dt>输出</dt>
        <dd>{output}</dd>

        {reasoning > 0 && (
          <>
            <dt>其中推理</dt>
            <dd>{reasoning}</dd>
          </>
        )}

        <dt>上限</dt>
        <dd>{known ? limit : <Pill tone="warning">模型目录未填</Pill>}</dd>
      </dl>

      <p className={s.note}>
        codex 的 tokenUsage 只给这四个值，没有 dsh 那种 system / tools / messages
        三段分布——这里显示的就是协议提供的全部，不做推算。
      </p>
    </div>
  )
}