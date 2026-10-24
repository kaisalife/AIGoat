import { describe, expect, it } from 'vitest'
import type { AnyEvent } from '../bridge/types'
import { useLedger } from './ledger'

/**
 * 账本 ring buffer 的**引用契约**回归测试。
 *
 * `useLedgerRows` 的选择器返回 `rows[key]`，Zustand v4 用 `Object.is` 比较。
 * 如果 append 原地 push（数组引用不变），订阅者永远不会重渲染——账本/轨迹/
 * 子代理树在第一条之后就不再更新。这里断言每次 push 都产出新数组。
 */
function delta(threadId: string, text: string): AnyEvent {
  return { type: 'textDelta', threadId, delta: text } as unknown as AnyEvent
}

describe('ledger：每次 push 都必须产出新的 rows 数组引用', () => {
  it('同一线程连续两次 push，第二个数组引用与第一个不同且长度增长', () => {
    const threadId = 'ledger-ref-test'
    useLedger.setState({ rows: {}, indexed: {}, seq: 0, total: 0 })

    useLedger.getState().push(delta(threadId, '一'))
    const first = useLedger.getState().rows[threadId]
    expect(first?.length).toBe(1)

    useLedger.getState().push(delta(threadId, '二'))
    const second = useLedger.getState().rows[threadId]

    // 这正是修复前的失败点：原地 push 会让 second === first。
    expect(second).not.toBe(first)
    expect(second?.length).toBe(2)
  })

  it('超出上限时截断为最新 LEDGER 容量', () => {
    const threadId = 'ledger-cap-test'
    useLedger.setState({ rows: {}, indexed: {}, seq: 0, total: 0 })
    for (let i = 0; i < 5100; i++) {
      useLedger.getState().push(delta(threadId, String(i)))
    }
    const rows = useLedger.getState().rows[threadId]
    expect(rows?.length).toBe(5000)
    expect(rows?.[rows.length - 1]?.summary).toBeTruthy()
  })
})

/**
 * 历史回补的**形状契约**回归测试。
 *
 * `thread/items/list` 的条目是 `{turnId, item:{type,…}}` 的包装，而账本行
 * 只认顶层 `type`。直接把包装塞进来时 kindOf 读不到 type、每行都被当
 * "不记账"丢掉——回补历史因此一直是空操作。
 */
describe('ledger：pushHistory 接受 thread/items/list 的包装条目', () => {
  it('拆包翻译 kind、给出行摘要，未知 item 落 unhandled 不丢弃', () => {
    const threadId = 'ledger-history-test'
    useLedger.setState({ rows: {}, indexed: {}, seq: 0, total: 0 })

    useLedger.getState().pushHistory(threadId, [
      { turnId: 't1', item: { type: 'agentMessage', id: 'a1', text: '你好世界', timestamp: 111 } },
      {
        turnId: 't1',
        item: { type: 'commandExecution', id: 'c1', command: 'cargo test', timestamp: 222 },
      },
      { turnId: 't1', item: { type: 'brandNewItem', id: 'x1', timestamp: 333 } },
    ])

    const rows = useLedger.getState().rows[threadId] ?? []
    expect(rows.length).toBe(3)
    expect(rows.every((r) => r.origin === 'history')).toBe(true)

    expect(rows[0]?.kind).toBe('textComplete')
    expect(rows[0]?.summary).toContain('你好世界')
    // 历史行的时间取协议时间戳
    expect(rows[0]?.at).toBe(111)

    expect(rows[1]?.kind).toBe('toolCallStart')
    expect(rows[1]?.summary).toContain('cargo test')

    // 不认识的 item 类型不丢：落 unhandled，原始方法名可查
    expect(rows[2]?.kind).toBe('unhandled')
    expect(rows[2]?.payload).toEqual({
      turnId: 't1',
      item: { type: 'brandNewItem', id: 'x1', timestamp: 333 },
    })
  })

  it('pushHistory 把历史行插到实时行前面（时间升序保持）', () => {
    const threadId = 'ledger-order-test'
    useLedger.setState({ rows: {}, indexed: {}, seq: 0, total: 0 })
    useLedger.getState().push(delta(threadId, '实时'))
    useLedger.getState().pushHistory(threadId, [
      { turnId: 't1', item: { type: 'agentMessage', id: 'h1', text: '历史', timestamp: 1 } },
    ])
    const rows = useLedger.getState().rows[threadId] ?? []
    expect(rows.length).toBe(2)
    expect(rows[0]?.origin).toBe('history')
    expect(rows[1]?.origin).toBe('live')
  })
})

/**
 * 子索引的**契约**回归测试。
 *
 * 改派徽标（挂在每个回合头）与血缘面包屑（常驻会话头）只订阅子索引，不再
 * 订阅全量行——否则每条 delta 都会让它们重扫/重建一遍全表。这里保证需要
 * 索引的种类确实进了子索引、其它种类不进、且 drop 会一并清掉。
 */
describe('ledger：只给需要的种类建子索引', () => {
  it('guardEvent / subAgentActivity 进 indexed，高频种类不进', () => {
    const threadId = 'ledger-index-test'
    useLedger.setState({ rows: {}, indexed: {}, seq: 0, total: 0 })

    useLedger.getState().push({
      type: 'guardEvent',
      threadId,
      event: { kind: 'modelRerouted', toModel: 'b' },
    } as unknown as AnyEvent)
    useLedger.getState().push({
      type: 'subAgentActivity',
      threadId,
      agentThreadId: 'a1',
      agentPath: 'root/a',
      kind: 'started',
    } as unknown as AnyEvent)
    useLedger.getState().push(delta(threadId, 'x'))

    const indexed = useLedger.getState().indexed[threadId] ?? {}
    expect(indexed['guardEvent']?.length).toBe(1)
    expect(indexed['subAgentActivity']?.length).toBe(1)
    // 高频的正文增量不建索引——那会让每线程多一份 5000 行的副本。
    expect(indexed['textDelta']).toBeUndefined()
  })

  it('drop 同时清掉行与子索引', () => {
    const threadId = 'ledger-drop-test'
    useLedger.setState({ rows: {}, indexed: {}, seq: 0, total: 0 })
    useLedger.getState().push({
      type: 'guardEvent',
      threadId,
      event: { kind: 'modelRerouted', toModel: 'b' },
    } as unknown as AnyEvent)

    useLedger.getState().drop(threadId)
    expect(useLedger.getState().rows[threadId]).toBeUndefined()
    expect(useLedger.getState().indexed[threadId]).toBeUndefined()
  })
})
