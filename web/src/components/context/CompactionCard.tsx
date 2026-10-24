import { Spinner, StateDot } from '../primitives'
import { CardShell } from '../cards/CardShell'
import s from './CompactionCard.module.css'

export interface CompactionCardProps {
  /** 进行中 = 还没收到 compacted。 */
  running: boolean
  /** 被摘要掉的更早消息条数；协议没给就不显示数字。 */
  summarizedCount?: number | null
  /** true = 用户手动 /compact 触发的；false = codex 自动压缩。 */
  byUser: boolean
  /** 跳到 Trajectory 看完整记录。 */
  onInspect?: () => void
}

/**
 * 压缩命令卡（13 号板块）。
 *
 * # 为什么要一张独立的卡
 *
 * 压缩是**不可逆的信息损失**：更早的历史被摘要之后，模型看不到其中的细节。
 * 界面上如果只在角落闪一条提示就过去，用户会在几轮之后才发现"它怎么不记得
 * 我刚才说的那个文件了"。所以压缩有独立的卡、两态、可停留。
 *
 * # 两态的差别不只是措辞
 *
 * `byUser=false`（自动压缩）**额外**要说明"这不是你干的"——否则用户会
 * 怀疑自己手滑点了什么。
 *
 * 压缩完成后账本仍全量保真（06 号板块），所以卡上永远有"看完整记录"的入口。
 */
export function CompactionCard(props: CompactionCardProps) {
  const { running, summarizedCount, byUser, onInspect } = props

  return (
    <div className={s.wrap} data-entry-id="compaction">
      <CardShell
        summary={running ? '正在压缩上下文…' : '上下文已压缩'}
        badge={byUser ? '/compact' : '自动'}
        running={running}
        tone={running ? 'accent' : 'warning'}
        // 进行中锁住：压缩期间内容还在变
        locked={running}
        defaultOpen={false}
        meta={
          !running && (
            <span className="spacer">
              <StateDot tone="warning" size={6} />
            </span>
          )
        }
      >
        <div className={s.body}>
          {running ? (
            <>
              <Spinner size={12} />
              <span>更早的历史正在被摘要。压缩期间模型仍能继续工作。</span>
            </>
          ) : (
            <>
              <p className={s.lead}>
                {byUser
                  ? '你触发的压缩已完成。'
                  : 'codex 自动压缩了上下文——不是你的操作。'}
                更早的消息已被摘要，模型看不到其中的细节。
                {summarizedCount !== null && summarizedCount !== undefined && (
                  <>共摘要 {summarizedCount} 条更早消息。</>
                )}
              </p>
              {onInspect && (
                <button type="button" className={s.link} onClick={onInspect}>
                  查看完整记录（Trajectory）
                </button>
              )}
            </>
          )}
        </div>
      </CardShell>
    </div>
  )
}