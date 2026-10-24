import { describe, expect, it } from 'vitest'
import {
  fileEditSummary,
  groupSummary,
  kindLabel,
  primaryArg,
  statusLabel,
  toolSummary,
  truncate,
} from './summaries'
import type { Entry, ToolEntry } from '../../store/entries'

/** 造一条工具条目。测试里只关心被摘要函数读的那几个字段。 */
function tool(over: Partial<ToolEntry> & { toolKind: ToolEntry['toolKind'] }): ToolEntry {
  return {
    id: 't1',
    at: 0,
    turn: 0,
    kind: 'tool',
    itemId: 'i1',
    name: 'tool_name',
    output: '',
    status: 'completed',
    streaming: false,
    ...over,
  }
}

describe('kindLabel', () => {
  it('已知类别给中文名', () => {
    expect(kindLabel('command')).toBe('命令')
    expect(kindLabel('mcp')).toBe('MCP')
    expect(kindLabel('collabAgent')).toBe('子 Agent')
  })

  it('未知类别退回「工具」而不是显示 undefined', () => {
    expect(kindLabel('somethingNew')).toBe('工具')
    expect(kindLabel('')).toBe('工具')
  })
})

describe('primaryArg', () => {
  it('优先取 command', () => {
    expect(primaryArg({ command: 'npm run build', cwd: '/x' })).toBe('npm run build')
  })

  it('command 缺失时按候选键顺序退让', () => {
    expect(primaryArg({ cwd: '/x', path: 'src/a.ts' })).toBe('src/a.ts')
    expect(primaryArg({ query: 'rust 教程' })).toBe('rust 教程')
  })

  it('字符串入参直接用', () => {
    expect(primaryArg('git status')).toBe('git status')
  })

  it('全都没有时返回空串（摘要退回工具名，不显示 undefined）', () => {
    expect(primaryArg(undefined)).toBe('')
    expect(primaryArg(null)).toBe('')
    expect(primaryArg({ unrelated: 1 })).toBe('')
    expect(primaryArg(42)).toBe('42')
  })

  it('超长截断到 48 字并加省略号', () => {
    const long = 'x'.repeat(80)
    const out = primaryArg({ command: long })
    expect(out).toHaveLength(49)
    expect(out.endsWith('…')).toBe(true)
  })

  it('首尾空白被压掉（换行的多行命令要能显示成一行）', () => {
    expect(primaryArg({ command: '  npm run\n  build  ' })).toBe('npm run build')
  })
})

describe('toolSummary', () => {
  it('命令类给「执行 + 命令」', () => {
    expect(toolSummary(tool({ toolKind: 'command', input: { command: 'ls -la' } }))).toBe('执行 ls -la')
  })

  it('没有可读参数时退回工具名', () => {
    expect(toolSummary(tool({ toolKind: 'mcp', name: 'read_file' }))).toBe('调用 read_file')
  })

  it('各动词按类别走', () => {
    expect(toolSummary(tool({ toolKind: 'webSearch', input: { query: 'x' } }))).toBe('检索 x')
    // collabAgent 的入参是 prompt，而 primaryArg 的候选键里**没有** prompt，
    // 所以它退回工具名——这是有意的：把一整段 prompt 塞进组头会挤爆一行。
    expect(toolSummary(tool({ toolKind: 'collabAgent', input: { prompt: 'p' } }))).toBe(
      '派发 tool_name',
    )
  })

  it('候选键里没有 prompt —— prompt 不是摘要素材（会挤爆组头）', () => {
    expect(primaryArg({ prompt: '一段很长的任务描述' })).toBe('')
  })
})

describe('fileEditSummary', () => {
  it('数 +/- 行，且排除 diff 头（+++ / ---）', () => {
    const diff = ['--- a/x.ts', '+++ b/x.ts', '+added', '-removed', ' kept'].join('\n')
    expect(fileEditSummary([{ diff }])).toBe('编辑了 1 个文件（+1 −1）')
  })

  it('没有增删时只报文件数', () => {
    expect(fileEditSummary([{ diff: ' context' }, { diff: '' }])).toBe('编辑了 2 个文件')
  })

  it('空数组说 0 个文件而不是崩', () => {
    expect(fileEditSummary([])).toBe('编辑了 0 个文件')
  })
})

describe('groupSummary', () => {
  const reasoning: Entry = { id: 'r', at: 0, turn: 0, kind: 'reasoning', text: '', streaming: false }

  it('空组：running 决定「处理中」还是「处理过程」', () => {
    expect(groupSummary([], true)).toBe('处理中')
    expect(groupSummary([], false)).toBe('处理过程')
  })

  it('重复同一条摘要会加 ×N', () => {
    const a = tool({ toolKind: 'command', input: { command: 'ls' } })
    const b = { ...a, id: 't2', itemId: 'i2' }
    expect(groupSummary([a, b], false)).toContain('执行 ls ×2')
  })

  it('推理 + 工具 + 文件混排时按出现顺序拼', () => {
    const nodes: Entry[] = [
      reasoning,
      tool({ toolKind: 'command', input: { command: 'ls' } }),
      {
        id: 'f',
        at: 0,
        turn: 0,
        kind: 'fileEdit',
        itemId: 'f',
        changes: [{ kind: 'update', path: 'a.ts', diff: '+1' }],
        status: 'completed',
      },
    ]
    expect(groupSummary(nodes, false)).toBe('思考，执行 ls，编辑 1 个文件')
  })

  it('fileEdit 的 changes 为空时不报「编辑 0 个文件」', () => {
    // 曾经写成 `files > 0` 之外无条件 push，那会让「编辑了 0 个文件」出现在组头。
    const empty: Entry = {
      id: 'f',
      at: 0,
      turn: 0,
      kind: 'fileEdit',
      itemId: 'f',
      changes: [],
      status: 'completed',
    }
    expect(groupSummary([empty], false)).toBe('处理过程')
  })

  it('running 时推理段带「中」', () => {
    expect(groupSummary([reasoning], true)).toBe('思考中')
  })

  it('fileEdit 按 changes 条数算，不按条目数', () => {
    const one: Entry = {
      id: 'f',
      at: 0,
      turn: 0,
      kind: 'fileEdit',
      itemId: 'f',
      changes: [
        { kind: 'update', path: 'a', diff: '' },
        { kind: 'update', path: 'b', diff: '' },
      ],
      status: 'completed',
    }
    expect(groupSummary([one], false)).toBe('编辑 2 个文件')
  })

  it('toolCall（客户端工具）用名字而不是动词', () => {
    const call: Entry = {
      id: 'c',
      at: 0,
      turn: 0,
      kind: 'toolCall',
      requestId: 'r',
      callId: 'c1',
      tool: 'fs_read',
      namespace: 'host',
      arguments: {},
      status: 'completed',
      output: '',
    }
    expect(groupSummary([call], false)).toBe('host/fs_read')
  })

  it('超过 50 字截断（组头只有一行，放不下就收）', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      tool({ toolKind: 'command', id: `t${i}`, itemId: `i${i}`, input: { command: `命令${i}` } }),
    )
    const out = groupSummary(many, false)
    expect(out.length).toBeLessThanOrEqual(49)
    expect(out.endsWith('…')).toBe(true)
  })

  it('非过程条目被忽略（用户消息不该出现在过程组摘要里）', () => {
    const user: Entry = { id: 'u', at: 0, turn: 0, kind: 'user', text: '你好' }
    expect(groupSummary([user], false)).toBe('处理过程')
  })
})

describe('truncate / statusLabel', () => {
  it('truncate 压空白并截断', () => {
    expect(truncate('a\n  b', 10)).toBe('a b')
    expect(truncate('abcdef', 3)).toBe('abc…')
    expect(truncate('abc', 10)).toBe('abc')
  })

  it('statusLabel 覆盖协议的四态，未知给「未知」', () => {
    expect(statusLabel('inProgress')).toBe('执行中')
    expect(statusLabel('completed')).toBe('成功')
    expect(statusLabel('failed')).toBe('失败')
    expect(statusLabel('declined')).toBe('已拒绝')
    expect(statusLabel('weird')).toBe('未知')
  })
})
