import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button, MarkdownText, type UserInputQuestion } from '../primitives'
import s from './UserInputCard.module.css'

export interface UserInputCardProps {
  entry: {
    kind: 'userInput'
    requestId: unknown
    questions: UserInputQuestion[]
    isBlocking: boolean
    state: 'pending' | 'answered'
    answers?: Record<string, string>
  }
  onSubmit: (answers: Record<string, string>) => void
}

/**
 * `item/tool/requestUserInput` 的卡片（12 号文件）。
 *
 * 三种题型：单选（有 options）、填空（options 为 null）、带「其他」的
 * 单选（isOther）。isSecret 的填空打码——它大概率在问 API key。
 *
 * 全部答完才能提交：一道题空着就发出去，等于让模型拿到半截答案去猜。
 */
export function UserInputCard({ entry, onSubmit }: UserInputCardProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(entry.answers ?? {})

  const pending = entry.state === 'pending'
  const complete = entry.questions.every((q) => (answers[q.id] ?? '').trim().length > 0)

  if (!pending) {
    return (
      <div className={s.done}>
        <span className={s.doneHead}>已回答</span>
        {entry.questions.map((q) => (
          <div key={q.id} className={s.doneRow}>
            <span className={s.doneLabel}>{q.header || q.question}</span>
            <span className={clsx(s.doneValue, q.isSecret && s.secret)}>
              {q.isSecret ? '••••••' : answers[q.id] ?? '（空）'}
            </span>
          </div>
        ))}
      </div>
    )
  }

  const set = (id: string, value: string) => setAnswers((prev) => ({ ...prev, [id]: value }))

  return (
    <div className={s.card}>
      {entry.isBlocking && (
        <p className={s.blocking}>模型在等你的回答，回答前无法继续。</p>
      )}
      {entry.questions.map((q) => (
        <Question key={q.id} question={q} value={answers[q.id] ?? ''} onChange={set} />
      ))}
      <div className={s.actions}>
        <Button variant="primary" disabled={!complete} onClick={() => onSubmit(answers)}>
          提交回答
        </Button>
        {!complete && <span className={s.hint}>把每道题都答了才能提交</span>}
      </div>
    </div>
  )
}

function Question({
  question,
  value,
  onChange,
}: {
  question: UserInputQuestion
  value: string
  onChange: (id: string, value: string) => void
}) {
  const [custom, setCustom] = useState(false)
  const useCustom = custom || question.options === null

  return (
    <fieldset className={s.question}>
      <legend className={s.qHead}>{question.header || question.question}</legend>
      <p className={s.qBody}>{question.question}</p>

      {question.options && !custom && (
        <div className={s.options}>
          {question.options.map((opt) => (
            <label key={opt.id} className={clsx(s.option, value === opt.label && s.optionOn)}>
              <input
                type="radio"
                name={question.id}
                checked={value === opt.label}
                onChange={() => onChange(question.id, opt.label)}
              />
              <span>{opt.label}</span>
              {opt.description && <span className={s.optDesc}>{opt.description}</span>}
            </label>
          ))}
          {question.isOther && (
            <label className={clsx(s.option, custom && s.optionOn)}>
              <input
                type="radio"
                name={question.id}
                checked={custom}
                onChange={() => {
                  setCustom(true)
                  onChange(question.id, '')
                }}
              />
              <span>其他…</span>
            </label>
          )}
        </div>
      )}

      {(useCustom || question.isOther) && (
        <input
          className={s.input}
          type={question.isSecret ? 'password' : 'text'}
          value={useCustom ? value : ''}
          placeholder={useCustom ? '填写你的回答' : '先选上面的选项，或点「其他」'}
          onChange={(e) => {
            if (!useCustom) setCustom(true)
            onChange(question.id, e.target.value)
          }}
        />
      )}
    </fieldset>
  )
}

/**
 * MCP elicitation 的卡片。
 *
 * 只展示请求里的文字，把内容原样交回去——形状由 MCP 服务器的
 * `requestedSchema` 决定，宿主不猜它要什么字段。一味渲染成表单会
 * 在 schema 稍微一变时就显示错位。
 */
export function ElicitationCard({
  entry,
  onSubmit,
}: {
  entry: {
    kind: 'elicitation'
    serverName?: string | null
    message?: string | null
    requestedSchema?: unknown
    state: 'pending' | 'answered'
  }
  onSubmit: (content: unknown) => void
}) {
  const [text, setText] = useState('')
  const pending = entry.state === 'pending'

  if (!pending) {
    return <div className={s.done}>已应答</div>
  }

  return (
    <div className={s.card}>
      <p className={s.blocking}>
        {entry.serverName ? `${entry.serverName} 需要你的输入` : 'MCP 服务器需要你的输入'}
      </p>
      {entry.message && <MarkdownText text={entry.message} />}
      {entry.requestedSchema ? (
        <details className={s.schema}>
          <summary>它要的字段</summary>
          <pre className={s.schemaBody}>{JSON.stringify(entry.requestedSchema, null, 2)}</pre>
        </details>
      ) : null}
      <div className={s.actions}>
        <input
          className={s.input}
          value={text}
          placeholder="按它的要求填写（会原样送回）"
          onChange={(e) => setText(e.target.value)}
        />
        <Button
          variant="primary"
          disabled={!text.trim()}
          onClick={() => onSubmit({ action: 'accept', content: { text: text.trim() } })}
        >
          提交
        </Button>
      </div>
    </div>
  )
}

/** 供 store 判定"有没有待答的提问"时复用，避免两处各写一遍判断。 */
export function usePendingQuestion(entries: { kind: string; state?: string }[]): number {
  return useMemo(
    () => entries.filter((e) => (e.kind === 'userInput' || e.kind === 'elicitation') && e.state === 'pending').length,
    [entries],
  )
}