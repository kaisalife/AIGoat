import clsx from 'clsx'
import { useState, type ReactNode } from 'react'
import { Button } from './Button'
import { useCopyFeedback } from './useCopyFeedback'
import s from './CodeBlock.module.css'

export interface CodeBlockProps {
  code: string
  /** 标题栏文字（文件名、命令）。省略就没有标题栏。 */
  title?: ReactNode
  /** 右上角附加控件。 */
  actions?: ReactNode
  /** 行号起始值；给了就渲染行号列。 */
  startLine?: number
  /** 行数超过这个值就折叠并给「展开」按钮。 */
  maxHeight?: number
  className?: string
}

/**
 * 代码块：等宽、可复制、可限高。
 *
 * 与 TerminalBlock 的分工：这里是**静态**内容（模型给的代码片段、注入预览）；
 * 会持续追加的那种走 TerminalBlock——它的增长动效和滚动策略不一样。
 */
export function CodeBlock({
  code,
  title,
  actions,
  startLine,
  maxHeight = 420,
  className,
}: CodeBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const { copied, onCopy } = useCopyFeedback(code)
  const lines = code.replace(/\n$/, '').split('\n')
  const clamp = maxHeight > 0 && lines.length * 20 > maxHeight

  return (
    <figure className={clsx(s.block, className)}>
      {(title !== undefined || actions !== undefined) && (
        <figcaption className={s.header}>
          {title !== undefined && <span className={s.title}>{title}</span>}
          <span className={s.spacer} />
          {actions}
          <Button
            variant="ghost"
            size="sm"
            aria-label="复制代码"
            onClick={onCopy}
          >
            {copied ? '已复制' : '复制'}
          </Button>
        </figcaption>
      )}
      <pre
        className={s.body}
        data-expanded={expanded || undefined}
        style={clamp && !expanded ? ({ maxHeight: `${maxHeight}px` } as React.CSSProperties) : undefined}
      >
        <code>
          {lines.map((line, i) => (
            <span key={i} className={s.line}>
              {startLine !== undefined && (
                <span className={s.no} aria-hidden="true">
                  {startLine + i}
                </span>
              )}
              {line || ' '}
            </span>
          ))}
        </code>
      </pre>
      {clamp && (
        <Button
          variant="ghost"
          size="sm"
          className={s.more}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起' : `展开全部 ${lines.length} 行`}
        </Button>
      )}
    </figure>
  )
}