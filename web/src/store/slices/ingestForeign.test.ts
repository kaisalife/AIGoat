import { describe, expect, it, vi } from 'vitest'
import { ingestForeign } from './ingestForeign'
import type { AgentEvent } from '../../bridge/types'
import type { ToolCallEntry } from '../entries'
import type { ShellState } from '../shell'
import { emptyTurnState } from '../turnState'
import type { GetShell, SetShell } from './types'

/** 只实现被这层用到的那几个字段，其余按 `ShellState` 断言齐。 */
function makeStore() {
  const state = {
    snapshots: new Map(),
    snapshotClock: new Map(),
    turn: emptyTurnState(),
    hint: null as string | null,
  } as unknown as ShellState
  const set: SetShell = (p) => Object.assign(state, typeof p === 'function' ? p(state) : p)
  const get: GetShell = () => state
  return { state, set, get }
}

const ev = (e: Record<string, unknown>): AgentEvent => e as never

describe('ingestForeign：子代理必须应答的三类', () => {
  /**
   * 回归：条目要落进**发起方线程的快照**（snapshots.ts 的 mustAnswer 明说）。
   *
   * 原来这三支都在建条目之前 return：应答照发（子代理不会被卡死），
   * 但界面上什么都不留——用户在子代理会话里看不到发生过什么。
   */
  it('审批请求会在该线程快照里留下条目', () => {
    const s = makeStore()
    ingestForeign(
      s.set,
      s.get,
      ev({ type: 'approvalRequested', threadId: 'sub-1', requestId: 7, command: 'rm -rf /' }),
      'sub-1',
    )
    expect(s.state.snapshots.get('sub-1')?.entries).toHaveLength(1)
    expect(s.state.snapshots.get('sub-1')?.entries[0]?.kind).toBe('approval')
  })

  it('提问请求也会留下条目', () => {
    const s = makeStore()
    ingestForeign(
      s.set,
      s.get,
      ev({ type: 'userInputRequested', threadId: 'sub-1', requestId: 8, questions: [] }),
      'sub-1',
    )
    expect(s.state.snapshots.get('sub-1')?.entries[0]?.kind).toBe('userInput')
  })

  it('MCP elicitation 也会留下条目', () => {
    const s = makeStore()
    ingestForeign(
      s.set,
      s.get,
      ev({ type: 'elicitationRequested', threadId: 'sub-1', requestId: 9, serverName: 'x' }),
      'sub-1',
    )
    expect(s.state.snapshots.get('sub-1')?.entries[0]?.kind).toBe('elicitation')
  })

  it('客户端工具调用会在该线程快照里留下卡片', () => {
    const s = makeStore()
    ingestForeign(
      s.set,
      s.get,
      ev({ type: 'toolCallRequested', threadId: 'sub-1', requestId: 10, tool: 'fs_read' }),
      'sub-1',
    )
    expect(s.state.snapshots.get('sub-1')?.entries[0]?.kind).toBe('toolCall')
  })

  /**
   * 回归：工具结果不能写进主会话。
   *
   * 原来 `runClientTool` 一律写 `turn`，而主会话里没有对应卡片（卡片被提前
   * return 掉了），那次 `map` 是空操作——工具真跑了、结果真回给 codex 了，
   * 而界面上一个字都没有。
   */
  it('工具结果落在快照里，不污染主会话', async () => {
    const s = makeStore()
    const before = s.state.turn
    ingestForeign(
      s.set,
      s.get,
      ev({ type: 'toolCallRequested', threadId: 'sub-1', requestId: 11, tool: '未注册的工具' }),
      'sub-1',
    )
    // 执行器是异步的，等它把状态推进完
    await vi.waitFor(() => {
      const card = s.state.snapshots.get('sub-1')?.entries[0] as ToolCallEntry | undefined
      expect(card?.status).not.toBe('running')
    })
    expect(s.state.turn).toBe(before)
    expect(s.state.turn.entries).toHaveLength(0)
  })

  it('已有快照时是接着追加，不会覆盖前面的内容', () => {
    const s = makeStore()
    ingestForeign(
      s.set,
      s.get,
      ev({ type: 'textDelta', threadId: 'sub-1', itemId: 'a', delta: '你好' }),
      'sub-1',
    )
    ingestForeign(
      s.set,
      s.get,
      ev({ type: 'approvalRequested', threadId: 'sub-1', requestId: 12 }),
      'sub-1',
    )
    expect(s.state.snapshots.get('sub-1')?.entries).toHaveLength(2)
  })
})

describe('ingestForeign：不进快照的两类', () => {
  it('终端事件走终端自己的 store，不进快照', () => {
    const s = makeStore()
    ingestForeign(
      s.set,
      s.get,
      ev({ type: 'terminalEvent', threadId: 'sub-1', execId: 't1', delta: 'x' }),
      'sub-1',
    )
    expect(s.state.snapshots.get('sub-1')).toBeUndefined()
  })

  it('目标事件不进快照（目标条只显示当前会话的）', () => {
    const s = makeStore()
    ingestForeign(s.set, s.get, ev({ type: 'goalEvent', threadId: 'sub-1', goal: {} }), 'sub-1')
    expect(s.state.snapshots.get('sub-1')).toBeUndefined()
  })
})