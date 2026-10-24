import clsx from 'clsx'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import s from './TerminalBlock.module.css'

export interface TerminalBlockProps {
  /** 已累积的完整输出（自行拼接增量，不要在组件里存历史）。 */
  output: string
  /** 仍在写入：显示闪烁光标，并把容器拉到贴底。 */
  running?: boolean
  /** 标题栏（会话名、命令）。省略则无标题栏。 */
  title?: ReactNode
  className?: string
}

/**
 * 终端输出容器。
 *
 * 和 CodeBlock 的差别只有一处，但很要紧：**它会一直长**。所以容器固定高度、
 * 每次写入后主动贴底，不做「展开全部」——终端是看最新输出的地方，
 * 用户手动往上翻的意图会被下一次写入打断，这在终端里是大家接受的行为；
 * 换来的是实现简单、也不会因为「智能保持滚动位置」而让人以为终端卡住了。
 */
export function TerminalBlock({ output, running = false, title, className }: TerminalBlockProps) {
  const body = useRef<HTMLPreElement | null>(null)
  // memo：输出没变时保持 `clean` 引用不变，贴底 effect 才不会因为父层
  // 无关重渲染而重复触发（那会让用户手动上翻的意图被平白打断）。
  const clean = useMemo(() => normalizeOutput(output), [output])

  useEffect(() => {
    const el = body.current
    if (el) el.scrollTop = el.scrollHeight
  }, [clean, running])

  return (
    <div className={clsx(s.block, className)}>
      {title !== undefined && <div className={s.header}>{title}</div>}
      <pre ref={body} className={s.body} data-running={running || undefined}>
        <code>
          {clean}
          {running && <span className={s.cursor} aria-hidden="true" />}
        </code>
      </pre>
    </div>
  )
}

/**
 * 规范化输出：CRLF → LF，去掉结尾换行。
 *
 * 原实现无条件跑两次正则——每次都为整段输出构造新串。输出是流式增长的，
 * 这一步每帧都做就是持续的分配。常见情况下既没有 `\r` 也没有尾换行，所以
 * 先用短路判断（只读、不分配），真有需要时才构造新串。
 */
function normalizeOutput(text: string): string {
  const withoutCr = text.indexOf('\r') === -1 ? text : text.replace(/\r\n/g, '\n')
  return withoutCr.endsWith('\n') ? withoutCr.slice(0, -1) : withoutCr
}