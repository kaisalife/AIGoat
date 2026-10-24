import { DisclosureRow, TextShimmer } from '../primitives'
import type { ReasoningEntry } from '../../store/entries'

/**
 * 推理折叠行（04 §1）。
 *
 * 默认折叠：推理往往比答复长好几倍，而且多数时候用户不关心过程。
 * 但**运行中自动展开**——正在生成的推理是用户想看的，不展开会让人
 * 以为卡住了。
 *
 * `isSummary` 的段用副标题样式：那是模型自己写的「我要做什么」，
 * 比正文更值得先看到。
 */
export function ReasoningRow({ entry }: { entry: ReasoningEntry }) {
  const body = entry.isSummary ? <SummaryBody text={entry.text} /> : <Body text={entry.text} />

  return (
    <div className="reasoning" data-entry-id={entry.id}>
      <DisclosureRow
        summary={
          entry.streaming ? (
            <TextShimmer>思考中…</TextShimmer>
          ) : (
            <span className="reasoning__title">
              {entry.isSummary ? '推理摘要' : '思考过程'}
            </span>
          )
        }
        meta={entry.streaming ? undefined : <span className="reasoning__len">{entry.text.length} 字</span>}
        defaultOpen={entry.streaming}
      >
        {body}
      </DisclosureRow>
    </div>
  )
}

function Body({ text }: { text: string }) {
  // 推理正文是纯文本，不走 Markdown：模型在这里写的东西经常含未闭合的
  // 标记（半个 `**`、半个 `` ` ``），渲染出来全是转义符反而更难读。
  return <div className="reasoning__body selectable">{text}</div>
}

function SummaryBody({ text }: { text: string }) {
  return (
    <div className="reasoning__summary selectable">
      {text.split('\n')
        .filter(Boolean)
        .map((line, i) => (
          <p key={`${line}-${i}`}>{line}</p>
        ))}
    </div>
  )
}