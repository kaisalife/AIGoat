import clsx from 'clsx'
import type { ReactNode } from 'react'
import { DisclosureRow, TextShimmer } from '../primitives'

export interface ProcessGroupProps {
  /** 组头摘要（算好的，见 summaries.ts 的 groupSummary）。 */
  summary: string
  /** 运行中：摘要走流光，且不允许折叠。 */
  running: boolean
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

/**
 * 过程折叠组（04 §3.1）。
 *
 * 「推理 + 工具调用 + 命令输出」这类条目连续出现时合成一块，否则一个
 * 回合能刷出几十行过程，把真正的答复挤到屏幕外。
 *
 * 运行中不锁折叠：用户想看着它跑。锁了会在第一次想展开时发现点不动，
 * 那比不给折叠更让人烦躁——所以这里只在**回合级**折叠上锁。
 */
export function ProcessGroup(props: ProcessGroupProps) {
  const { summary, running, defaultOpen = false, children, className } = props

  return (
    <div className={clsx('process', running && 'process--running', className)}>
      <DisclosureRow
        summary={
          running ? (
            <TextShimmer>{summary}</TextShimmer>
          ) : (
            <span className="process__label">{summary}</span>
          )
        }
        meta={running ? '进行中' : undefined}
        defaultOpen={defaultOpen || running}
      >
        <div className="process__body">{children}</div>
      </DisclosureRow>
    </div>
  )
}