import { describe, expect, it } from 'vitest'
import { applyText } from './text'
import type { AssistantEntry, ReasoningEntry, Entry } from '../entries'
import type { TurnState } from '../turnState'
import { emptyTurnState } from '../turnState'

type Ev = Parameters<typeof applyText>[1]

function of<T extends Entry['kind']>(s: TurnState, kind: T): Array<Extract<Entry, { kind: T }>> {
  return s.entries.filter((e): e is Extract<Entry, { kind: T }> => e.kind === kind)
}

const delta = (itemId: string, d: string): Ev =>
  ({ type: 'textDelta', itemId, delta: d }) as never
const complete = (itemId: string, text: string): Ev =>
  ({ type: 'textComplete', itemId, text }) as never
const think = (itemId: string, d: string): Ev =>
  ({ type: 'reasoningDelta', itemId, delta: d, isSummary: false }) as never

describe('applyText：交错的两段正文', () => {
  /**
   * 回归：delta 与 complete 必须按 itemId 收口。
   *
   * 原实现判断「最后一条 assistant 是否还在流式」而忽略 itemId：
   * item X 的 delta 被并进 item Y，等 X 的 complete 到达时 `replace` 找不到 X
   * 就追加一条 —— 同一段文字出现两遍。
   */
  it('B 开始后 A 恢复，A 的内容不会被并进 B', () => {
    let s = emptyTurnState()
    s = applyText(s, delta('A', 'a1'), 0) as TurnState
    s = applyText(s, delta('B', 'b1'), 0) as TurnState
    s = applyText(s, delta('A', 'a2'), 0) as TurnState

    const rows = of(s, 'assistant')
    expect(rows.map((r: AssistantEntry) => r.text)).toEqual(['a1a2', 'b1'])
  })

  it('complete 按 itemId 覆盖自己那条，不新建', () => {
    let s = emptyTurnState()
    s = applyText(s, delta('A', 'a1'), 0) as TurnState
    s = applyText(s, delta('B', 'b1'), 0) as TurnState
    s = applyText(s, complete('A', 'a1a2'), 0) as TurnState

    const rows = of(s, 'assistant')
    expect(rows).toHaveLength(2)
    expect(rows.find((r: AssistantEntry) => r.id === 'A')?.text).toBe('a1a2')
    expect(rows.find((r: AssistantEntry) => r.id === 'A')?.streaming).toBe(false)
    expect(rows.find((r: AssistantEntry) => r.id === 'B')?.streaming).toBe(true)
  })

  it('同一条连续 delta 累积到一处', () => {
    let s = emptyTurnState()
    s = applyText(s, delta('A', 'x'), 0) as TurnState
    s = applyText(s, delta('A', 'y'), 0) as TurnState
    s = applyText(s, delta('A', 'z'), 0) as TurnState

    const rows = of(s, 'assistant')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text).toBe('xyz')
  })

  it('已收口的条目不被后来的同 id delta 改写，而是另起一段', () => {
    let s = emptyTurnState()
    s = applyText(s, delta('A', 'a'), 0) as TurnState
    s = applyText(s, complete('A', 'a'), 0) as TurnState
    s = applyText(s, delta('A', 'a-again'), 0) as TurnState

    const rows = of(s, 'assistant')
    // 第一条的最终正文一个字都不能多。
    expect(rows[0]?.text).toBe('a')
    expect(rows[0]?.streaming).toBe(false)
    // 新段落在另一条，且换了唯一 id（沿用 A 会在 React 侧撞 key）。
    expect(rows).toHaveLength(2)
    expect(rows[1]?.text).toBe('a-again')
    expect(rows[1]?.id).not.toBe('A')
  })
})

describe('applyText：交错的推理段', () => {
  /**
   * 回归：推理增量按 itemId 收口。
   *
   * 原实现只看「最后一条 reasoning」，连 streaming 都不判断：一轮里出现
   * 第二段推理后，第一段恢复时内容被追加进第二段，两段混成一条。
   */
  it('B 开始后 A 恢复，两段推理不会混在一起', () => {
    let s = emptyTurnState()
    s = applyText(s, think('R1', 'r1a'), 0) as TurnState
    s = applyText(s, think('R2', 'r2a'), 0) as TurnState
    s = applyText(s, think('R1', 'r1b'), 0) as TurnState

    const rows = of(s, 'reasoning')
    expect(rows.map((r: ReasoningEntry) => r.text)).toEqual(['r1ar1b', 'r2a'])
  })

  it('同一条推理的连续 delta 累积到一处', () => {
    let s = emptyTurnState()
    s = applyText(s, think('R', 'a'), 0) as TurnState
    s = applyText(s, think('R', 'b'), 0) as TurnState

    const rows = of(s, 'reasoning')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text).toBe('ab')
  })

  it('isSummary 一旦为真就不再被后续 delta 打回', () => {
    let s = emptyTurnState()
    s = applyText(s, { type: 'reasoningDelta', itemId: 'R', delta: 'a', isSummary: true } as never, 0) as TurnState
    s = applyText(s, think('R', 'b'), 0) as TurnState
    expect(of(s, 'reasoning')[0]?.isSummary).toBe(true)
  })
})