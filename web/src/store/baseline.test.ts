import { describe, expect, it } from 'vitest'
import { baselineFromItems } from './baseline'
import { mapItem } from './baselineMap'
import type { ItemEntry } from './baseline'

/** 造一条 `thread/items/list` 的返回项。 */
function entry(turnId: string, id: string, item: Record<string, unknown>): ItemEntry {
  return { turnId, item: { id, ...item } }
}

/**
 * 按协议的**倒序**（`sortDirection: "desc"`，新→旧）造一组条目。
 *
 * `baselineFromItems` 收到的是倒序输入，内部会翻回升序。测试必须给对
 * 方向——我第一版给了升序，于是"回合预览取最后一条用户消息"这类断言全错，
 * 看起来像代码有 bug，其实是喂反了。这个函数存在就是为了让方向只写一次。
 */
function desc(rows: ItemEntry[]): ItemEntry[] {
  return rows
}

describe('baselineFromItems', () => {
  it('入参是倒序的，输出翻回时间升序', () => {
    // 协议给的重连补历史方向是 desc，所以最老的那条在数组开头。
    const rows = [
      entry('t2', 'b', { type: 'agentMessage', text: '第二条', timestamp: 200 }),
      entry('t1', 'a', { type: 'userMessage', content: [{ type: 'text', text: '第一条' }], timestamp: 100 }),
    ]
    const out = baselineFromItems(rows)
    expect(out.entries.map((e) => e.id)).toEqual(['a', 'b'])
    expect(out.turns).toHaveLength(2)
  })

  it('按 turnId 切回合，并重建回合元信息', () => {
    // 倒序：新 → 旧。翻回来后是 t1 在前、t2 在后。
    const rows = desc([
      entry('t2', 'c1', { type: 'userMessage', content: [{ text: '第二轮' }], timestamp: 300 }),
      entry('t1', 'b2', { type: 'agentMessage', text: '答', timestamp: 200 }),
      entry('t1', 'b1', { type: 'userMessage', content: [{ text: '问' }], timestamp: 100 }),
    ])
    const out = baselineFromItems(rows)
    expect(out.turns.map((t) => t.turnId)).toEqual(['t1', 't2'])
    expect(out.entries.filter((e) => e.kind === 'user')).toHaveLength(2)
  })

  it('回合预览取该回合最后一条用户消息', () => {
    const rows = desc([
      entry('t1', 'u2', { type: 'userMessage', content: [{ text: '追问' }], timestamp: 300 }),
      entry('t1', 'a1', { type: 'agentMessage', text: '答', timestamp: 200 }),
      entry('t1', 'u1', { type: 'userMessage', content: [{ text: '第一个问题' }], timestamp: 100 }),
    ])
    expect(baselineFromItems(rows).turns[0]?.preview).toBe('追问')
  })

  it('历史回合的 status 标成 completed（它确实不再跑了）', () => {
    const out = baselineFromItems([entry('t1', 'u1', { type: 'userMessage', content: [{ text: 'x' }] })])
    expect(out.turns[0]?.status).toBe('completed')
    expect(out.turns[0]?.usage).toBeNull()
  })

  it('plan item 不进消息流（它走 PlanDocTab，进了会把流顶乱）', () => {
    const out = baselineFromItems([entry('t1', 'p1', { type: 'plan', text: '1. 做事' })])
    expect(out.entries).toHaveLength(0)
  })

  /**
   * 回归：plan item 不进消息流，但**必须**抬到 `plan.draft`。
   *
   * `turn.plan` 原先只由实时的 planUpdated/planDelta 填，`baselineFromItems`
   * 从不设置它 —— 于是切会话、重连、重同步基线之后计划面板一律空白，
   * 而计划明明还在会话里。
   */
  it('plan item 的正文进 plan.draft', () => {
    const out = baselineFromItems([entry('t1', 'p1', { type: 'plan', text: '1. 做事' })])
    expect(out.entries).toHaveLength(0)
    expect(out.plan.draft).toBe('1. 做事')
  })

  it('多个 plan item 取最后一个（计划是覆盖式的）', () => {
    // 倒序输入：新→旧，所以第一项是较新的那份。
    const out = baselineFromItems([
      entry('t2', 'p2', { type: 'plan', text: '新计划' }),
      entry('t1', 'p1', { type: 'plan', text: '旧计划' }),
    ])
    expect(out.plan.draft).toBe('新计划')
  })

  it('没有 plan item 时 draft 为空', () => {
    const out = baselineFromItems([entry('t1', 'm1', { type: 'agentMessage', text: 'hi' })])
    expect(out.plan.draft).toBe('')
  })

  it('未知 item 类型被跳过而不是塞占位', () => {
    const out = baselineFromItems([
      entry('t1', 'u1', { type: 'userMessage', content: [{ text: 'x' }] }),
      entry('t1', 'weird', { type: 'someFutureThing' }),
    ])
    expect(out.entries.map((e) => e.id)).toEqual(['u1'])
  })

  it('fileChange 的 kind 归一成 update（协议是内嵌 tag）', () => {
    const out = baselineFromItems([
      entry('t1', 'f1', {
        type: 'fileChange',
        status: 'completed',
        changes: [{ path: 'a.ts', diff: '+1', kind: { type: 'add' } }],
      }),
    ])
    const file = out.entries[0]
    expect(file?.kind).toBe('fileEdit')
    if (file?.kind === 'fileEdit') {
      expect(file.changes[0]).toEqual({ kind: 'update', path: 'a.ts', diff: '+1', movePath: undefined })
    }
  })

  it('未知状态归成 completed（不会错的默认）', () => {
    const out = baselineFromItems([
      entry('t1', 'c1', { type: 'commandExecution', command: 'ls', status: 'weirdNew' }),
    ])
    const t = out.entries[0]
    if (t?.kind === 'tool') expect(t.status).toBe('completed')
  })

  it('缺 turnId 的归到同一个伪回合，不散成多块', () => {
    const rows = [
      entry('', 'a', { type: 'userMessage', content: [{ text: 'x' }] }),
      entry('', 'b', { type: 'agentMessage', text: 'y' }),
    ]
    const out = baselineFromItems(rows)
    expect(out.turns).toHaveLength(1)
    expect(out.turns[0]?.turnId).toBeNull()
  })

  it('时间戳缺省时用序号占位，保证单调（排序只看相对）', () => {
    const rows = [
      entry('t1', 'b', { type: 'agentMessage', text: 'b' }),
      entry('t1', 'a', { type: 'agentMessage', text: 'a' }),
    ]
    const out = baselineFromItems(rows)
    const times = out.entries.map((e) => e.at)
    expect(times[0]).toBeLessThan(times[1] ?? 0)
  })

  it('幂等：同样的输入跑两次结果一致（重连可反复触发）', () => {
    const rows = [
      entry('t1', 'a', { type: 'userMessage', content: [{ text: 'x' }], timestamp: 100 }),
      entry('t1', 'b', { type: 'agentMessage', text: 'y', timestamp: 200 }),
    ]
    const first = baselineFromItems(rows)
    const second = baselineFromItems(rows)
    // id 是自增的全局序号，所以比 id 之外的字段。
    expect(second.entries.map((e) => [e.kind, e.at, e.turn])).toEqual(
      first.entries.map((e) => [e.kind, e.at, e.turn]),
    )
    expect(second.turns.map((t) => [t.index, t.turnId, t.preview])).toEqual(
      first.turns.map((t) => [t.index, t.turnId, t.preview]),
    )
  })

  it('空输入给一个可渲染的空态（不崩）', () => {
    const out = baselineFromItems([])
    expect(out.entries).toEqual([])
    expect(out.turns).toEqual([])
  })

  it('给了 activeTurn 时游标落在那一轮之后', () => {
    const rows = desc([
      entry('t2', 'b', { type: 'userMessage', content: [{ text: '2' }], timestamp: 200 }),
      entry('t1', 'a', { type: 'userMessage', content: [{ text: '1' }], timestamp: 100 }),
    ])
    expect(baselineFromItems(rows, 't1').turn).toBe(1)
    expect(baselineFromItems(rows, 't2').turn).toBe(2)
  })
})

/**
 * `reasoning.content` 的形态分歧回归。
 *
 * Rust `map/history.rs` 原先只认字符串、前端这里只认数组，于是「切会话回放」
 * 与「重连基线」必有一边丢掉推理正文。两边现在都放宽成「字符串或字符串数组
 * 都认」，这里锁住前端这一侧。
 */
describe('mapItem：reasoning 正文（content 两种形态都要认）', () => {
  it('content 是字符串', () => {
    const out = mapItem({ type: 'reasoning', summary: ['想'], content: '正文' }, 'r1', 0, 0)
    expect(out && 'text' in out ? out.text : null).toBe('想\n正文')
  })

  it('content 是字符串数组', () => {
    const out = mapItem({ type: 'reasoning', summary: ['想'], content: ['正', '文'] }, 'r2', 0, 0)
    expect(out && 'text' in out ? out.text : null).toBe('想\n正\n文')
  })

  it('没有 summary 时只剩 content', () => {
    const out = mapItem({ type: 'reasoning', content: '只有正文' }, 'r3', 0, 0)
    expect(out && 'text' in out ? out.text : null).toBe('只有正文')
  })
})
