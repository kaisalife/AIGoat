import clsx from 'clsx'
import s from './DiffBlock.module.css'

export interface DiffLine {
  kind: 'add' | 'del' | 'ctx' | 'hunk' | 'meta'
  text: string
  /** hunk 头里的 `@@ -a,b +c,d @@` 解析出来的旧/新行号。 */
  oldLine?: number
  newLine?: number
}

/**
 * 解析 unified diff 文本。不引 diff 库——协议给的就是标准 unified diff
 * 片段，自己解析更可控，也省掉一个依赖。无法识别的行按 `meta` 处理，
 * 宁可多显示一行也不丢内容。
 */
export function parseUnifiedDiff(diff: string): DiffLine[] {
  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0

  for (const raw of diff.split('\n')) {
    const hunk = /^@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/.exec(raw)
    if (hunk) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      out.push({ kind: 'hunk', text: raw })
      continue
    }
    if (isFileHeader(raw)) {
      out.push({ kind: 'meta', text: raw })
      continue
    }
    if (raw.startsWith('+')) {
      out.push({ kind: 'add', text: raw.slice(1), newLine: newNo++ })
    } else if (raw.startsWith('-')) {
      out.push({ kind: 'del', text: raw.slice(1), oldLine: oldNo++ })
    } else if (raw.startsWith(' ')) {
      out.push({ kind: 'ctx', text: raw.slice(1), oldLine: oldNo++, newLine: newNo++ })
    } else if (raw.length === 0) {
      // 空行通常是 diff 末尾的换行残留，跳过以免多出一行空白
      continue
    } else {
      out.push({ kind: 'meta', text: raw })
    }
  }
  return out
}

function isFileHeader(line: string): boolean {
  return (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ')
  )
}

export interface DiffBlockProps {
  /** unified diff 全文。 */
  diff: string
  className?: string
  /** 空内容时的占位文案；null 则整个块不渲染。 */
  empty?: string | null
  /**
   * 已解析的行。调用方若已为统计解析过一次（如 `DiffView`），传进来即可
   * 免掉二次解析——diff 可能很长，重复解析在流式下会白白翻倍。
   */
  lines?: DiffLine[]
}

/**
 * unified diff 的渲染体（不含文件头）。
 *
 * 增删用极浅的语义底色 + 左侧色条，而不是整行染色：整行染色在几十行
 * 以上就变成一片红绿墙，重点反而找不到了。
 */
export function DiffBlock({ diff, className, empty = null, lines: provided }: DiffBlockProps) {
  const lines = provided ?? parseUnifiedDiff(diff)

  if (lines.length === 0) {
    if (empty === null) return null
    return <p className={clsx(s.empty, className)}>{empty}</p>
  }

  return (
    <pre className={clsx(s.body, className)}>
      {lines.map((line, i) => (
        <DiffLineRow key={i} line={line} />
      ))}
    </pre>
  )
}

export interface DiffStatProps {
  lines: DiffLine[]
  className?: string
}

/** 只解析统计信息时不必渲染全文。单趟数增删，别 filter 两遍。 */
export function DiffStat({ lines, className }: DiffStatProps) {
  let add = 0
  let del = 0
  for (const line of lines) {
    if (line.kind === 'add') add += 1
    else if (line.kind === 'del') del += 1
  }
  if (add === 0 && del === 0) return null
  return (
    <span className={clsx(s.stat, className)}>
      <span className={s.statAdd}>+{add}</span>
      <span className={s.statDel}>−{del}</span>
    </span>
  )
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const cls = clsx(s.line, s[line.kind])
  if (line.kind === 'hunk' || line.kind === 'meta') {
    return <span className={cls}>{line.text}</span>
  }
  const marker = line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '
  return (
    <span className={cls}>
      <span className={s.no}>{line.oldLine ?? line.newLine ?? ''}</span>
      <span className={s.marker}>{marker}</span>
      <span className={s.text}>{line.text}</span>
    </span>
  )
}