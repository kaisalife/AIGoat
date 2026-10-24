import { describe, expect, it } from 'vitest'
import { buildTurnBlocks, reuseOrBuildBlock } from './grouping'
import type { Entry } from './entries'
import type { TurnBlock } from './grouping'
import type { TurnMeta } from './turnState'

/**
 * 归组的纯逻辑。`reuseOrBuildBlock` 是这轮性能改造的关键：它决定一个回合
 * 块能不能沿用上一帧的对象——判断错了要么白白重渲染（退化成改造前），
 * 要么把该更新的块钉死（内容不再刷新）。两种都要测到。
 */

const user = (id: string, turn: number, text = id): Entry => ({
  id,
  kind: 'user',
  at: 0,
  turn,
  text,
})

const meta = (index: number, status: TurnMeta['status'] = 'completed'): TurnMeta => ({
  index,
  turnId: null,
  startedAt: 0,
  endedAt: null,
  status,
  preview: '',
  usage: null,
})

const block = (m: TurnMeta): TurnBlock => ({ meta: m, nodes: [] })

describe('buildTurnBlocks', () => {
  it('按回合切块，下标升序', () => {
    const blocks = buildTurnBlocks([user('a', 2), user('b', 1)], [meta(1), meta(2)])
    expect(blocks.map((b) => b.meta.index)).toEqual([1, 2])
  })

  it('只有元信息、还没条目的回合也出块', () => {
    const blocks = buildTurnBlocks([], [meta(1, 'inProgress')])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.nodes).toEqual([])
  })

  it('只有条目、没有元信息的回合用 pending 占位', () => {
    const blocks = buildTurnBlocks([user('a', 3)], [])
    expect(blocks[0]?.meta.index).toBe(3)
    expect(blocks[0]?.meta.status).toBe('pending')
  })
})

describe('reuseOrBuildBlock：只重建真正变化的回合', () => {
  it('条目逐个同引用且元信息同引用 → 复用旧块（引用不变）', () => {
    const m = meta(1)
    const entries = [user('a', 1)]
    const old = block(m)
    expect(reuseOrBuildBlock(old, entries, m, entries)).toBe(old)
  })

  it('条目引用变了（流式追加）→ 重建', () => {
    const m = meta(1, 'inProgress')
    const old = block(m)
    const prev = [user('a', 1, '旧')]
    const next = [user('a', 1, '旧新')]
    expect(reuseOrBuildBlock(old, prev, m, next)).not.toBe(old)
  })

  it('条目数量变了 → 重建', () => {
    const m = meta(1, 'inProgress')
    const old = block(m)
    const prev = [user('a', 1)]
    const next = [user('a', 1), user('b', 1)]
    expect(reuseOrBuildBlock(old, prev, m, next)).not.toBe(old)
  })

  it('元信息引用变了（usage 更新等）→ 重建', () => {
    const entries = [user('a', 1)]
    const old = block(meta(1))
    expect(reuseOrBuildBlock(old, entries, meta(1), entries)).not.toBe(old)
  })

  it('没有旧块 → 新建，且带上传入的 meta', () => {
    const m = meta(1)
    const built = reuseOrBuildBlock(undefined, undefined, m, [user('a', 1)])
    expect(built.meta).toBe(m)
  })
})
