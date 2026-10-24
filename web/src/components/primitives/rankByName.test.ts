import { describe, expect, it } from 'vitest'
import { rankByName } from './rankByName'

const items = [
  { name: 'compact', label: '压缩上下文' },
  { name: 'new-thread', label: '新建会话' },
  { name: 'goal', label: '目标' },
]

/**
 * dsh `rank-by-name` 的核心语义回归：有序子序列匹配、前缀优先、
 * 边界加权、label 同为搜索键、空查询保序。
 */
describe('rankByName（移植自 dsh）', () => {
  it('空查询原样返回输入顺序', () => {
    expect(rankByName(items, '').map((i) => i.name)).toEqual(['compact', 'new-thread', 'goal'])
  })

  it('前缀命中排最前', () => {
    expect(rankByName(items, 'co')[0]?.name).toBe('compact')
  })

  it('有序子序列命中：cp 只匹配 compact，nw 匹配 new-thread', () => {
    expect(rankByName(items, 'cp').map((i) => i.name)).toEqual(['compact'])
    expect(rankByName(items, 'nw')[0]?.name).toBe('new-thread')
  })

  it('分隔符边界加权：nt 命中 new-thread（n-t 边界）', () => {
    expect(rankByName(items, 'nt')[0]?.name).toBe('new-thread')
  })

  it('label 与 name 同为搜索键（中文可查）', () => {
    expect(rankByName(items, '压缩')[0]?.name).toBe('compact')
    expect(rankByName(items, '新建')[0]?.name).toBe('new-thread')
  })

  it('不构成子序列的查询无结果', () => {
    expect(rankByName(items, 'zz')).toEqual([])
  })
})
