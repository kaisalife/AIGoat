import { describe, expect, it } from 'vitest'
import { turnFromHistory } from './index'
import type { HistoryEntry } from '../../bridge/contract'

/**
 * 回归：resume 回放必须恢复计划正文与工具卡的退出码/耗时。
 *
 * Rust 侧 `map_history` 一直把 `commandExecution` 的 `exitCode`/`durationMs`
 * 和 `plan` item 的正文发出来，但 TS 这一侧既没在 `HistoryEntry` 类型里声明、
 * 也没在映射时接住：切回一个会话，工具卡不再显示「exit 1」和耗时，计划面板
 * 直接空白。
 */
describe('turnFromHistory', () => {
  it('plan 条目不进消息流，但要抬到 plan.draft', () => {
    const history: HistoryEntry[] = [
      { kind: 'user', text: '做件事' },
      { kind: 'plan', text: '1. 先这样' },
      { kind: 'assistant', text: '好' },
    ]
    const out = turnFromHistory(history)

    // 消息流里只有两条消息，没有 plan
    expect(out.entries.map((e) => e.kind)).toEqual(['user', 'assistant'])
    expect(out.plan.draft).toBe('1. 先这样')
  })

  it('多个 plan 取最后一个', () => {
    const out = turnFromHistory([
      { kind: 'plan', text: '旧' },
      { kind: 'plan', text: '新' },
    ])
    expect(out.plan.draft).toBe('新')
  })

  it('没有 plan 时 draft 为空', () => {
    const out = turnFromHistory([{ kind: 'assistant', text: 'hi' }])
    expect(out.plan.draft).toBe('')
  })

  it('工具卡接住壳侧带来的 exitCode 与 durationMs', () => {
    const out = turnFromHistory([
      {
        kind: 'tool',
        toolKind: 'command',
        name: 'npm test',
        status: 'failed',
        output: 'boom',
        exitCode: 1,
        durationMs: 1234,
      },
    ])
    const tool = out.entries[0]
    expect(tool).toMatchObject({ kind: 'tool', exitCode: 1, durationMs: 1234, streaming: false })
  })

  it('壳侧没给 exitCode 时留空，而不是编一个 0', () => {
    const out = turnFromHistory([
      { kind: 'tool', toolKind: 'command', name: 'ls', status: 'completed', output: '' },
    ])
    const tool = out.entries[0]
    expect(tool).toMatchObject({ kind: 'tool' })
    expect(tool && 'exitCode' in tool ? tool.exitCode : undefined).toBeUndefined()
  })

  it('未知种类被跳过而不是塞占位', () => {
    const out = turnFromHistory([
      { kind: 'user', text: 'a' },
      { kind: 'plan', text: '' },
    ])
    expect(out.entries).toHaveLength(1)
    expect(out.plan.draft).toBe('')
  })
})