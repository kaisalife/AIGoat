import { describe, expect, it } from 'vitest'
import { applyThreadEvent } from './applyThreadEvent'
import type { AgentEvent, ThreadSummary } from '../../bridge/types'
import type { ShellState } from '../shell'
import type { GetShell, SetShell } from './types'

/**
 * 这层只改列表，所以给它一个最小的假 store：只提供 applyThreadEvent 用到的
 * 几个字段，其余按 `ShellState` 断言齐（函数式 `set` 的参数类型是它）。
 * `set` 支持函数式更新——真实 store 是 zustand，那边也是这个签名。
 */
function makeStore(seed: {
  threadList?: ThreadSummary[]
  archivedList?: ThreadSummary[]
  activeThreadId?: string | null
  streaming?: boolean
}) {
  const state = {
    threadList: seed.threadList ?? [],
    archivedList: seed.archivedList ?? [],
    activeThreadId: seed.activeThreadId ?? null,
    currentTurnId: seed.streaming ? 'turn-1' : null,
    turnStatus: seed.streaming ? 'inProgress' : null,
    turn: { entries: [] },
  } as unknown as ShellState
  const set: SetShell = (p) => Object.assign(state, typeof p === 'function' ? p(state) : p)
  const get: GetShell = () => state
  return { state, set, get }
}

const row = (id: string, preview = id): ThreadSummary =>
  ({ id, preview, updatedAt: 0 }) as ThreadSummary

function ev(
  kind: string,
  threadId: string,
  extra: Record<string, unknown> = {},
): Extract<AgentEvent, { type: 'threadEvent' }> {
  return { type: 'threadEvent', threadId, event: { kind, ...extra } } as never
}

describe('applyThreadEvent：unarchived', () => {
  /**
   * 回归：`unarchived` 之前完全没被处理。
   *
   * `ThreadEventKind` 明确列了它，Rust 侧也把 `thread/unarchived` 映射成它，
   * 但原实现只认 `archived` / `deleted` —— 服务端取消归档这个事实永远到不了
   * 列表。表现是：换个窗口、或从 codex CLI 取消归档，本界面毫无反应。
   */
  it('把会话从归档区搬回活跃列表', () => {
    const s = makeStore({ archivedList: [row('t1'), row('t2')] })
    applyThreadEvent(s.set, s.get, ev('unarchived', 't1'))

    expect(s.state.threadList.map((t) => t.id)).toEqual(['t1'])
    expect(s.state.archivedList.map((t) => t.id)).toEqual(['t2'])
  })

  it('本来就在活跃列表里时是幂等的，不产生重复条目', () => {
    const s = makeStore({ threadList: [row('t1')], archivedList: [] })
    applyThreadEvent(s.set, s.get, ev('unarchived', 't1'))

    expect(s.state.threadList.map((t) => t.id)).toEqual(['t1'])
  })

  it('取消归档不会把当前会话判成「已关闭」', () => {
    const s = makeStore({ threadList: [row('t1')], activeThreadId: 't1', streaming: true })
    applyThreadEvent(s.set, s.get, ev('unarchived', 't1'))

    // 取消归档只换列表位置，当前会话照旧开着，回合态不能被清掉。
    expect(s.state.activeThreadId).toBe('t1')
    expect(s.state.currentTurnId).toBe('turn-1')
  })

  it('两侧都没有这个会话时不动状态', () => {
    const s = makeStore({})
    applyThreadEvent(s.set, s.get, ev('unarchived', 'ghost'))
    expect(s.state.threadList).toEqual([])
    expect(s.state.archivedList).toEqual([])
  })
})

describe('applyThreadEvent：archived / deleted 会清回合态', () => {
  /**
   * 回归：原来只把 `activeThreadId` 置空。
   *
   * 于是 `turnActive` / `busy` 还是 true、消息流还挂着那个会话的内容——
   * 界面在显示一个「当前并没有打开的会话」的运行态。判定要与
   * `forgetThreads` 对齐。
   */
  it('归档当前会话会连回合态一起清', () => {
    const s = makeStore({ threadList: [row('t1')], activeThreadId: 't1', streaming: true })
    applyThreadEvent(s.set, s.get, ev('archived', 't1'))

    expect(s.state.activeThreadId).toBeNull()
    expect(s.state.currentTurnId).toBeNull()
    expect(s.state.turnStatus).toBeNull()
    expect(s.state.turn.entries).toEqual([])
  })

  it('删除当前会话同样清回合态，并从两侧列表摘掉', () => {
    const s = makeStore({ threadList: [row('t1')], activeThreadId: 't1', streaming: true })
    applyThreadEvent(s.set, s.get, ev('deleted', 't1'))

    expect(s.state.activeThreadId).toBeNull()
    expect(s.state.threadList).toEqual([])
    // 删除不是归档：不该搬进归档区。
    expect(s.state.archivedList).toEqual([])
  })

  it('归档的不是当前会话时，不动当前会话的回合态', () => {
    const s = makeStore({ threadList: [row('t1'), row('t2')], activeThreadId: 't2', streaming: true })
    applyThreadEvent(s.set, s.get, ev('archived', 't1'))

    expect(s.state.activeThreadId).toBe('t2')
    expect(s.state.currentTurnId).toBe('turn-1')
    expect(s.state.archivedList.map((t) => t.id)).toEqual(['t1'])
  })

  it('重复收到 archived 不会在归档区堆出两条', () => {
    const s = makeStore({ threadList: [row('t1')] })
    applyThreadEvent(s.set, s.get, ev('archived', 't1'))
    applyThreadEvent(s.set, s.get, ev('archived', 't1'))
    expect(s.state.archivedList).toHaveLength(1)
  })
})

describe('applyThreadEvent：改名与状态两侧都改', () => {
  /** 回归：原来只 patch `threadList`，归档区一直显示旧名字。 */
  it('renamed 同时更新活跃列表与归档区', () => {
    const s = makeStore({ threadList: [row('t1')], archivedList: [row('t2')] })
    applyThreadEvent(s.set, s.get, ev('renamed', 't2', { threadName: '新名字' }))

    expect(s.state.archivedList[0]?.preview).toBe('新名字')
    expect(s.state.threadList[0]?.preview).toBe('t1')
  })

  it('statusChanged 同时更新两侧', () => {
    const s = makeStore({ threadList: [row('t1')], archivedList: [row('t2')] })
    applyThreadEvent(
      s.set,
      s.get,
      ev('statusChanged', 't2', { statusType: 'active', activeFlags: ['x'] }),
    )
    expect(s.state.archivedList[0]?.status).toEqual({ type: 'active', activeFlags: ['x'] })
  })

  it('改名事件带 null 名字时不动（不是把标题清空）', () => {
    const s = makeStore({ threadList: [row('t1', '原名')] })
    applyThreadEvent(s.set, s.get, ev('renamed', 't1', { threadName: null }))
    expect(s.state.threadList[0]?.preview).toBe('原名')
  })
})