import { describe, expect, it } from 'vitest'
import { budgetPressure, sessionStats, turnSummaries } from './projections'
import type { TokenUsage, TurnMeta } from './turnState'

function turn(over: Partial<TurnMeta> = {}): TurnMeta {
  return {
    index: 0,
    turnId: 't',
    startedAt: 1000,
    endedAt: 2000,
    status: 'completed',
    preview: '',
    usage: null,
    ...over,
  }
}

function usage(total: number): TokenUsage {
  return { total, input: 0, cached: 0, output: 0, reasoning: 0 }
}

describe('turnSummaries', () => {
  it('间隔用 startedAt 差（等待体感），不是"这轮跑了多久"', () => {
    const rows = [
      turn({ index: 0, startedAt: 1000, endedAt: 5000 }), // 跑了 4s
      turn({ index: 1, startedAt: 9000, endedAt: 9100 }), // 隔了 4s 才发下一轮
    ]
    const out = turnSummaries(rows)
    expect(out[0]?.gapMs).toBeNull() // 第一轮没有"上一轮"
    expect(out[1]?.gapMs).toBe(4000)
  })

  it('上一轮还没结束就取不到间隔 → null 而不是 0（0 会被画成"间隔 0ms"）', () => {
    const rows = [
      turn({ index: 0, startedAt: 1000, endedAt: null }),
      turn({ index: 1, startedAt: 2000, endedAt: null }),
    ]
    expect(turnSummaries(rows)[1]?.gapMs).toBeNull()
  })

  it('负间隔被夹到 0（时钟回拨不该显示负数）', () => {
    const rows = [turn({ startedAt: 5000, endedAt: 9000 }), turn({ startedAt: 1000 })]
    expect(turnSummaries(rows)[1]?.gapMs).toBe(0)
  })

  it('token 取该回合的 usage.total', () => {
    expect(turnSummaries([turn({ usage: usage(1234) })])[0]?.tokens).toBe(1234)
  })

  it('没有 usage 时给 0 而不是 undefined', () => {
    expect(turnSummaries([turn({ usage: null })])[0]?.tokens).toBe(0)
  })
})

describe('sessionStats', () => {
  it('空列表给全 0、平均值 null', () => {
    expect(sessionStats([])).toEqual({
      turns: 0,
      completed: 0,
      failed: 0,
      running: false,
      totalTokens: 0,
      totalElapsedMs: 0,
      avgTurnMs: null,
    })
  })

  it('只统计有 endedAt 的回合算时长（进行中的不拉低平均）', () => {
    const rows = [
      turn({ index: 0, startedAt: 0, endedAt: 1000, status: 'completed' }),
      turn({ index: 1, startedAt: 2000, endedAt: null, status: 'inProgress' }),
    ]
    const out = sessionStats(rows)
    expect(out.turns).toBe(2)
    expect(out.running).toBe(true)
    expect(out.totalElapsedMs).toBe(1000)
    expect(out.avgTurnMs).toBe(1000)
  })

  it('token 跨回合累加', () => {
    const rows = [
      turn({ index: 0, usage: usage(100) }),
      turn({ index: 1, usage: usage(250) }),
    ]
    expect(sessionStats(rows).totalTokens).toBe(350)
  })

  it('failed 与 running 分开计', () => {
    const rows = [
      turn({ index: 0, status: 'failed' }),
      turn({ index: 1, status: 'inProgress' }),
      turn({ index: 2, status: 'completed' }),
    ]
    const out = sessionStats(rows)
    expect(out.completed).toBe(1)
    expect(out.failed).toBe(1)
    expect(out.running).toBe(true)
  })
})

describe('budgetPressure', () => {
  const u = (input: number, output: number): TokenUsage => ({
    total: input + output,
    input,
    cached: 0,
    output,
    reasoning: 0,
  })

  it('used = input + output', () => {
    expect(budgetPressure(u(1000, 500), 2000).used).toBe(1500)
  })

  it('缓存命中的部分仍占窗口（它要被读一遍）', () => {
    const withCache: TokenUsage = { total: 1500, input: 1000, cached: 800, output: 500, reasoning: 0 }
    expect(budgetPressure(withCache, 2000).used).toBe(1500)
  })

  it('两档阈值：70% warn、90% danger', () => {
    expect(budgetPressure(u(700, 0), 1000).band).toBe('warn')
    expect(budgetPressure(u(699, 0), 1000).band).toBe('ok')
    expect(budgetPressure(u(900, 0), 1000).band).toBe('danger')
  })

  it('limit 为 0（模型目录没填）时不报错，且不谎报"满"', () => {
    const out = budgetPressure(u(999999, 0), 0)
    expect(out.ratio).toBe(0)
    expect(out.band).toBe('ok')
  })

  it('超限的 ratio 夹到 1（否则进度条会画出界）', () => {
    expect(budgetPressure(u(5000, 0), 1000).ratio).toBe(1)
  })
})
