import clsx from 'clsx'
import { useMemo } from 'react'
import s from './PathLabel.module.css'

export interface PathLabelProps {
  path: string
  /** 完整路径的提示——省略掉的那截靠它。 */
  title?: string
  /** 最多显示几级目录；超出的层级并进「…」。 */
  maxSegments?: number
  /** 末级用主色，其余灰掉。 */
  emphasis?: boolean
  className?: string
}

/**
 * 路径标签：文件名突出、目录从左侧截断。
 *
 * 左侧截断而不是右侧——路径的辨识信息在尾部（`src/store/ui.ts` 比
 * `ui.ts` 有用得多），保住尾部才是对的。
 */
export function PathLabel({
  path,
  title,
  maxSegments = 3,
  emphasis = true,
  className,
}: PathLabelProps) {
  const { leading, tail, sep } = useMemo(() => splitPath(path, maxSegments), [path, maxSegments])

  return (
    <span className={clsx(s.path, className)} title={title ?? path}>
      {leading && <span className={s.leading}>{leading}</span>}
      {tail.map((seg, i) => (
        <span key={i} className={clsx(s.segment, emphasis && i === tail.length - 1 && s.last)}>
          {i > 0 && <span className={s.sep}>{sep}</span>}
          {seg}
        </span>
      ))}
    </span>
  )
}

/** Windows 用 `\`，POSIX 用 `/`；两种都在这个界面里出现过，不能写死。 */
function splitPath(
  path: string,
  maxSegments: number,
): { leading: string; tail: string[]; sep: string } {
  const windows = path.includes('\\') && !path.includes('/')
  const sep = windows ? '\\' : '/'
  const all = path.split(windows ? /[\\/]/ : '/').filter(Boolean)
  if (all.length <= maxSegments) return { leading: '', tail: all, sep }
  const tail = all.slice(all.length - maxSegments)
  const root = all[0] ?? ''
  // POSIX 绝对路径的根要留着（`C:/` 这种带盘符的短段不是目录名）
  return { leading: `${!windows && root.length <= 2 ? root + sep : sep}…${sep}`, tail, sep }
}