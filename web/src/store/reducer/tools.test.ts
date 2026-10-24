import { describe, expect, it } from 'vitest'
import { applyTool } from './tools'
import { findByItemId } from './helpers'
import type { ToolEntry } from '../entries'
import type { TurnState } from '../turnState'
import { emptyTurnState } from '../turnState'

/** 造一条工具调用条目，模拟 `toolCallStart` 的产物。 */
function toolStart(state: TurnState, itemId: string): TurnState {
  return applyTool(
    state,
    { type: 'toolCallStart', itemId, toolKind: 'function', name: itemId, input: {} } as never,
    Date.now(),
  ) as TurnState
}

function tools(state: TurnState): ToolEntry[] {
  return state.entries.filter((e): e is ToolEntry => e.kind === 'tool')
}

describe('applyTool：并行工具调用', () => {
  /**
   * 回归：delta / end 必须按 itemId 收口，不能按「最后一条工具」。
   *
   * codex 会并行跑多个工具，于是 A start、B start、A delta、A end 是常态。
   * 原实现用 `lastOf(entries, 'tool')`，此时取到的是 B，A 的 delta 与 end
   * 匹配不上被静默丢弃——A 的卡片永远停在 inProgress 上转圈，而它的输出也
   * 全丢了。这类缺陷不会报错，只会表现为界面少东西，所以必须有测试钉住。
   */
  it('A 的 delta 不会被更晚开始的 B 吃掉', () => {
    let s = toolStart(emptyTurnState(), 'A')
    s = toolStart(s, 'B')

    s = applyTool(s, { type: 'toolCallDelta', itemId: 'A', delta: 'a-out' } as never, 0) as TurnState

    const [a, b] = tools(s)
    expect(a?.output).toBe('a-out')
    // B 没收到 delta，就不该有内容——不能把 A 的串到 B 上。
    expect(b?.output).toBe('')
  })

  it('A 的 toolCallEnd 能结束 A，而不是 B', () => {
    let s = toolStart(emptyTurnState(), 'A')
    s = toolStart(s, 'B')

    s = applyTool(
      s,
      {
        type: 'toolCallEnd',
        itemId: 'A',
        toolKind: 'function',
        name: 'A',
        status: 'completed',
        output: 'done-a',
      } as never,
      0,
    ) as TurnState

    const [a, b] = tools(s)
    expect(a?.status).toBe('completed')
    expect(a?.output).toBe('done-a')
    expect(a?.streaming).toBe(false)
    // B 必须仍在跑：不能被 A 的结束事件带走。
    expect(b?.status).toBe('inProgress')
  })

  it('interleaved 顺序下每个条目都落到正确的那一个', () => {
    let s = toolStart(emptyTurnState(), 'A')
    s = toolStart(s, 'B')
    s = applyTool(s, { type: 'toolCallDelta', itemId: 'B', delta: 'b1' } as never, 0) as TurnState
    s = applyTool(s, { type: 'toolCallDelta', itemId: 'A', delta: 'a1' } as never, 0) as TurnState
    s = applyTool(s, { type: 'toolCallDelta', itemId: 'B', delta: 'b2' } as never, 0) as TurnState

    const [a, b] = tools(s)
    expect(a?.output).toBe('a1')
    expect(b?.output).toBe('b1b2')
  })

  it('找不到对应条目时不改动状态（不要凭空造条目）', () => {
    const s = toolStart(emptyTurnState(), 'A')
    const next = applyTool(s, { type: 'toolCallDelta', itemId: 'ZZZ', delta: 'x' } as never, 0)
    expect(next).toBe(s)
  })
})

describe('applyTool：进度流与输出流分开', () => {
  it('progress 不混进 output', () => {
    let s = toolStart(emptyTurnState(), 'A')
    s = applyTool(s, { type: 'toolCallDelta', itemId: 'A', delta: '读取中', stream: 'progress' } as never, 0) as TurnState
    s = applyTool(s, { type: 'toolCallDelta', itemId: 'A', delta: '结果' } as never, 0) as TurnState

    const a = tools(s)[0]
    expect(a?.output).toBe('结果')
    expect(a?.progress).toBe('读取中')
  })

  it('同一条进度重复上报不显示两遍', () => {
    let s = toolStart(emptyTurnState(), 'A')
    for (let i = 0; i < 3; i++) {
      s = applyTool(s, { type: 'toolCallDelta', itemId: 'A', delta: '读取中', stream: 'progress' } as never, 0) as TurnState
    }
    expect(tools(s)[0]?.progress).toBe('读取中')
  })
})

describe('applyTool：fileChangeOutput', () => {
  /**
   * 回归：这条高频流**不产出新状态**。
   *
   * 原实现返回 `{...state, entries: replace(entries, lastOf(...))}` —— 内容上
   * 等于没改，却每次复制一份 entries 数组，于是每来一条（高频）整条消息流
   * 就重渲染一次。返回原 state 让 React 按引用相等跳过。
   */
  it('返回同一个 state 引用，不触发重渲染', () => {
    let s = emptyTurnState()
    s = applyTool(s, { type: 'fileEdit', itemId: 'f1', changes: [], status: 'done' } as never, 0) as TurnState
    const next = applyTool(s, { type: 'fileChangeOutput', itemId: 'f1', delta: '写入…' } as never, 0)
    expect(next).toBe(s)
  })
})

describe('findByItemId', () => {
  it('itemId 缺失时返回 undefined', () => {
    const s = toolStart(emptyTurnState(), 'A')
    expect(findByItemId(s.entries, 'tool', undefined)).toBeUndefined()
  })

  it('kind 不匹配时不误命中', () => {
    const s = toolStart(emptyTurnState(), 'A')
    expect(findByItemId(s.entries, 'fileEdit', 'A')).toBeUndefined()
  })
})