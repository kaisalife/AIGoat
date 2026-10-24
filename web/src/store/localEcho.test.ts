import { describe, expect, it } from 'vitest'
import { claimEcho, dropEcho, echoUserMessage } from './localEcho'
import { emptyTurnState } from './turnState'
import type { UserEntry } from './entries'

describe('echoUserMessage', () => {
  it('插入的条目带 pending 与 clientMsgId', () => {
    const { state, clientMsgId } = echoUserMessage(emptyTurnState(), '你好')
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]).toMatchObject({ kind: 'user', text: '你好', pending: true })
    expect(clientMsgId).toBeTruthy()
  })

  it('两次发送的 clientMsgId 不相同', () => {
    const a = echoUserMessage(emptyTurnState(), 'A')
    const b = echoUserMessage(a.state, 'B')
    expect(a.clientMsgId).not.toBe(b.clientMsgId)
  })
})

describe('dropEcho', () => {
  it('只撤掉指定 clientMsgId 的那一条', () => {
    const a = echoUserMessage(emptyTurnState(), 'A')
    const b = echoUserMessage(a.state, 'B')
    const after = dropEcho(b.state, a.clientMsgId)
    expect(after.entries).toHaveLength(1)
    expect(after.entries[0]).toMatchObject({ text: 'B' })
  })

  it('clientMsgId 不匹配时不动任何条目', () => {
    const a = echoUserMessage(emptyTurnState(), 'A')
    const after = dropEcho(a.state, 'cmid-不存在的')
    expect(after.entries).toHaveLength(1)
  })
})

describe('claimEcho', () => {
  it('有 clientMsgId 时精确命中，不看正文', () => {
    const a = echoUserMessage(emptyTurnState(), 'A')
    // 正文故意不同：证明走的是 id 路径。
    expect(claimEcho(a.state, a.clientMsgId, '完全不同的正文')).toBe(0)
  })

  it('clientMsgId 认不到时按正文兜底', () => {
    const a = echoUserMessage(emptyTurnState(), '你好')
    expect(claimEcho(a.state, undefined, '你好')).toBe(0)
    expect(claimEcho(a.state, undefined, '别的')).toBe(-1)
  })

  /**
   * 回归：多条 pending 时，兜底必须扫到底。
   *
   * 协议通常不在 userMessage 上回传 clientUserMessageId，所以兜底是常态。
   * 原实现从后往前扫，**碰到第一条 pending 就比对，对不上立刻返回 -1**：
   * 连发 A、B 时服务端先确认 A，而最新的 pending 是 B，于是认领失败——
   * A 的正式消息被当新条目追加，回显 A 永远 pending，同一句话显示两次。
   */
  it('多条 pending 且正文不同：认领要命中更早的那条，而不是撞上最新就放弃', () => {
    const a = echoUserMessage(emptyTurnState(), '第一条')
    const b = echoUserMessage(a.state, '第二条')
    expect(b.state.entries.filter((e) => (e as UserEntry).pending)).toHaveLength(2)

    // 服务端先确认「第一条」，而它是**较早**的那条 pending。
    expect(claimEcho(b.state, undefined, '第一条')).toBe(0)
  })

  it('正文都不匹配时返回 -1', () => {
    const a = echoUserMessage(emptyTurnState(), 'A')
    const b = echoUserMessage(a.state, 'B')
    expect(claimEcho(b.state, undefined, 'C')).toBe(-1)
  })

  it('认领过的条目不会被二次认领', () => {
    const a = echoUserMessage(emptyTurnState(), 'A')
    // 认领的语义是**就地替换**：下标不变，pending 变 false。
    const idx = claimEcho(a.state, a.clientMsgId, 'A')
    expect(idx).toBe(0)

    const rows = a.state.entries.slice()
    rows[idx] = { ...rows[idx], pending: false } as never
    const claimed = { ...a.state, entries: rows }

    // 再来一条同正文的权威消息时，不该再认领到这条已确认的。
    expect(claimEcho(claimed, undefined, 'A')).toBe(-1)
  })
})