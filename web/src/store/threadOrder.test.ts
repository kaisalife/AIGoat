import { describe, expect, it } from 'vitest'
import {
  applyPinned,
  currentOrder,
  pruneIds,
  reorderIds,
  togglePinned,
} from './threadOrder'
import type { ThreadSummary } from '../bridge/types'

function thread(id: string, over: Partial<ThreadSummary> = {}): ThreadSummary {
  return { id, preview: id, ...over }
}

describe('currentOrder', () => {
  it('用户排过序就用他那份', () => {
    expect(currentOrder([thread('a'), thread('b')], ['b', 'a'])).toEqual(['b', 'a'])
  })

  it('没排过序（空）时以列表现状为准 —— 第一次拖拽才能落一份完整顺序', () => {
    expect(currentOrder([thread('a'), thread('b')], [])).toEqual(['a', 'b'])
  })
})

describe('applyPinned', () => {
  const list = [thread('a'), thread('b'), thread('c')]

  it('置顶的排前面，其余按手工顺序', () => {
    const out = applyPinned(list, ['c'], ['c', 'b', 'a'])
    expect(out.map((t) => t.id)).toEqual(['c', 'b', 'a'])
  })

  it('把 pinned 标记回写到条目上（行组件靠它决定显示星标）', () => {
    const out = applyPinned(list, ['b'], ['b', 'a', 'c'])
    expect(out.find((t) => t.id === 'b')?.pinned).toBe(true)
    expect(out.find((t) => t.id === 'a')?.pinned).toBe(false)
  })

  it('order 里没有的会话（别的窗口刚建的）排到末尾而不是消失', () => {
    const out = applyPinned(list, [], ['c'])
    expect(out.map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('不改动传入的数组（原数组被别处持有）', () => {
    const input = [thread('a'), thread('b')]
    applyPinned(input, ['b'])
    expect(input.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('多个置顶之间保持手工顺序', () => {
    const out = applyPinned(list, ['a', 'c'], ['c', 'a', 'b'])
    expect(out.map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('togglePinned', () => {
  it('加进去', () => {
    const out = togglePinned([thread('a'), thread('b')], [], 'b')
    expect(out.pinned).toEqual(['b'])
    expect(out.list.map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('再点一次取消', () => {
    const out = togglePinned([thread('a'), thread('b')], ['b'], 'b')
    expect(out.pinned).toEqual([])
    expect(out.list.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('reorderIds', () => {
  it('前移', () => {
    expect(reorderIds(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('后移', () => {
    expect(reorderIds(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('原地不动返回**同一个引用**（调用方据此判断"没变化，别落盘"）', () => {
    const order = ['a', 'b']
    expect(reorderIds(order, 1, 1)).toBe(order)
  })

  it('越界原样返回（拖拽事件在边界偶尔给出等于长度的下标）', () => {
    const order = ['a', 'b']
    expect(reorderIds(order, -1, 0)).toBe(order)
    expect(reorderIds(order, 0, 5)).toBe(order)
    expect(reorderIds(order, 2, 0)).toBe(order)
  })

  it('不改动传入的数组', () => {
    const order = ['a', 'b', 'c']
    reorderIds(order, 0, 2)
    expect(order).toEqual(['a', 'b', 'c'])
  })
})

describe('pruneIds', () => {
  it('摘掉已删会话（否则那份 id 列表只增不减）', () => {
    expect(pruneIds(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
  })

  it('没有要删的返回同一个引用', () => {
    const ids = ['a']
    expect(pruneIds(ids, [])).toBe(ids)
  })
})
