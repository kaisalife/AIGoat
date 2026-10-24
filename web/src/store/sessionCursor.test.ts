import { describe, expect, it } from 'vitest'
import { lastThreadFor, pruneLastThreads, withLastThread } from './sessionCursor'

/**
 * 会话游标（重开应用后回到上次会话）的纯逻辑。这两处都有"安静地做错"的
 * 风险——恢复错线程会指着一个不在列表里的会话，写错分桶会把别的目录的
 * 会话串过来，所以要有测试兜底。
 */

describe('lastThreadFor：挑出此刻可恢复的会话', () => {
  const session = { lastThreadByCwd: { 'C:/a': 't-a', 'C:/b': 't-b' } }

  it('命中：记录存在且仍在列表里', () => {
    expect(lastThreadFor(session, 'C:/a', ['t-a', 't-x'])).toBe('t-a')
  })

  it('记录里的会话已被删/归档（不在列表里）→ 不恢复', () => {
    expect(lastThreadFor(session, 'C:/a', ['t-x'])).toBeNull()
  })

  it('这个工作区没记过 → 不恢复', () => {
    expect(lastThreadFor(session, 'C:/c', ['t-a'])).toBeNull()
  })

  it('没有 cwd → 不恢复（还没打开工作区时不该乱指）', () => {
    expect(lastThreadFor(session, '', ['t-a'])).toBeNull()
  })

  it('整段 session 缺失也不炸', () => {
    expect(lastThreadFor(undefined, 'C:/a', ['t-a'])).toBeNull()
  })

  it('按工作区分桶：B 目录的游标不会在 A 目录生效', () => {
    expect(lastThreadFor(session, 'C:/a', ['t-b'])).toBeNull()
  })
})

describe('withLastThread：写回游标', () => {
  it('新增一个分桶条目', () => {
    expect(withLastThread(undefined, 'C:/a', 't-a')).toEqual({
      lastThreadByCwd: { 'C:/a': 't-a' },
    })
  })

  it('不动其它工作区的条目（不能把整段覆盖掉）', () => {
    const next = withLastThread({ lastThreadByCwd: { 'C:/b': 't-b' } }, 'C:/a', 't-a')
    expect(next.lastThreadByCwd).toEqual({ 'C:/b': 't-b', 'C:/a': 't-a' })
  })

  it('同一工作区再记一次是覆盖，不堆积', () => {
    const next = withLastThread({ lastThreadByCwd: { 'C:/a': 'old' } }, 'C:/a', 'new')
    expect(next.lastThreadByCwd).toEqual({ 'C:/a': 'new' })
  })

  it('不改原对象（store 之外还持有旧引用时不会被偷改）', () => {
    const original = { lastThreadByCwd: { 'C:/a': 'old' } }
    withLastThread(original, 'C:/a', 'new')
    expect(original.lastThreadByCwd).toEqual({ 'C:/a': 'old' })
  })
})

describe('pruneLastThreads：摘掉指向已删会话的恢复游标', () => {
  it('值命中删除集的那条被摘掉', () => {
    const next = pruneLastThreads(
      { lastThreadByCwd: { 'C:/a': 't-dead', 'C:/b': 't-live' } },
      new Set(['t-dead']),
    )
    expect(next?.lastThreadByCwd).toEqual({ 'C:/b': 't-live' })
  })

  it('没有命中时返回 null（调用方据此跳过落盘）', () => {
    expect(
      pruneLastThreads({ lastThreadByCwd: { 'C:/a': 't1' } }, new Set(['other'])),
    ).toBeNull()
  })

  it('整段缺失时返回 null，不炸', () => {
    expect(pruneLastThreads(undefined, new Set(['t1']))).toBeNull()
  })

  it('不改原对象', () => {
    const original = { lastThreadByCwd: { 'C:/a': 't-dead' } }
    pruneLastThreads(original, new Set(['t-dead']))
    expect(original.lastThreadByCwd).toEqual({ 'C:/a': 't-dead' })
  })
})
