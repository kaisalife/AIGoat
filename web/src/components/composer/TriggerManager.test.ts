import { describe, expect, it } from 'vitest'
import {
  applySelection,
  itemsFor,
  triggerAt,
  triggerSpan,
  type PopupItem,
  type SkillCandidate,
  type TeamCandidate,
} from './TriggerManager'

/**
 * 触发符区间定位回归测试。
 *
 * 修复前 `triggerSpan` 要求**紧贴光标的前一个字符**是 `/`/`@`，所以只有
 * 空查询（刚敲下 `/`）能命中；`/pl`、`@src/app` 这种已经输入了查询串的
 * 情况返回 null，弹层不筛选、选择也无法替换掉整段。
 */
describe('triggerAt', () => {
  it('识别行首的 / 命令并带出查询串', () => {
    expect(triggerAt('/pl', 3)).toEqual({ kind: 'command', start: 0, query: 'pl' })
  })

  it('识别空白之后的 @ 文件引用', () => {
    expect(triggerAt('hi @src', 7)).toEqual({ kind: 'file', start: 3, query: 'src' })
  })

  it('行中间的斜杠不触发（a/b 不是命令）', () => {
    expect(triggerAt('a/b', 3)).toBeNull()
  })

  it('碰到空白说明这段里没有触发符', () => {
    expect(triggerAt('hello world', 11)).toBeNull()
  })

  it('triggerSpan 与 triggerAt 使用同一判据', () => {
    expect(triggerSpan('/pl', 3)).toEqual({ start: 0, query: 'pl' })
    expect(triggerSpan('a/b', 3)).toBeNull()
  })
})

/**
 * 选中后**替换触发段**的回归测试。
 *
 * 修复前 `applySelection` 从触发符位置一刀切到**文本结尾**，光标后面还有
 * 字时（在句子中间敲 `/` 或 `@`）会把后面的内容整段删掉——静默丢字。
 */
describe('applySelection：替换触发段、保留其后文本', () => {
  const plan: PopupItem = { kind: 'command', id: 'plan', label: 'plan', group: '命令' }
  const file: PopupItem = { kind: 'file', id: 'src/app.ts', label: 'src/app.ts', group: '文件' }

  it('光标在末尾（常见）：整段替换', () => {
    expect(applySelection('/pl', { start: 0, query: 'pl' }, plan)).toEqual({
      text: '/plan ',
      caret: 6,
    })
  })

  it('光标后有文本：后面的字必须保留（此前会被整段删掉）', () => {
    expect(applySelection('please /pl rest', { start: 7, query: 'pl' }, plan)).toEqual({
      text: 'please /plan  rest',
      caret: 13,
    })
  })

  it('文件引用：替换成 [label] 且保留尾随文本', () => {
    expect(applySelection('看 @src more', { start: 2, query: 'src' }, file)).toEqual({
      text: '看 [src/app.ts]  more',
      caret: 15,
    })
  })

  it('没有触发段（span=null）：追加到末尾', () => {
    expect(applySelection('abc', null, plan)).toEqual({ text: 'abc/plan ', caret: 9 })
  })
})

/**
 * 技能候选：`/` 弹层的「技能」分组（codex skills/list）。
 *
 * 关键契约是**插入格式**：codex 原生把消息里的 `$SkillName` 识别为技能
 * mention 并注入 SKILL.md，所以选中技能必须插 `$name ` 而不是 `/name `。
 */
describe('技能候选', () => {
  const skills: SkillCandidate[] = [
    { name: 'team-builder', description: '组建团队、增删改成员' },
    { name: 'review', description: '素材质量评审' },
  ]

  it('`/` 弹层 = 本地命令 + 技能，技能在「技能」分组', () => {
    const items = itemsFor({ phase: 'trigger', kind: 'command', query: '' }, [], skills, [])
    // 命令注册表在组件层才填充（测试环境为空），这里只断言技能候选本身。
    expect(items.filter((i) => i.kind === 'skill').map((i) => i.id)).toEqual([
      expect.stringMatching(/review|team-builder/),
      expect.stringMatching(/review|team-builder/),
    ])
    expect(items.every((i) => i.group === '技能')).toBe(true)
  })

  it('前缀过滤：查询串收窄技能', () => {
    const items = itemsFor({ phase: 'trigger', kind: 'command', query: 'team' }, [], skills, [])
    expect(items.map((i) => i.id)).toContain('team-builder')
    expect(items.map((i) => i.id)).not.toContain('review')
  })

  it('选中技能插成 $name mention（codex 原生语法）', () => {
    const item: PopupItem = { kind: 'skill', id: 'team-builder', label: '$team-builder', group: '技能' }
    expect(applySelection('/team', { start: 0, query: 'team' }, item)).toEqual({
      text: '$team-builder ',
      caret: 14,
    })
  })
})

/**
 * 团队候选：`@` 弹层的「团队」分组（注册表编组）。
 *
 * 关键契约是**插入格式**：团队没有 codex 原生语法，插 `@name ` 作为点名
 * 记号，含义由 team-builder 的 SKILL.md 向 codex 解释。团队随文件一起
 * 出现在 `@` 弹层里——用户想引用「什么东西」时不必先想清它是文件还是团队。
 */
describe('团队候选', () => {
  const teams: TeamCandidate[] = [
    { name: '游戏组', hint: 'reviewer / builder' },
    { name: '素材组', hint: '暂无成员' },
  ]
  const files = [{ path: 'src/app.ts', name: 'app.ts' }]

  it('`@` 弹层 = 文件 + 团队，团队在「团队」分组', () => {
    const items = itemsFor({ phase: 'trigger', kind: 'file', query: '' }, files, [], teams)
    expect(items.filter((i) => i.kind === 'file').map((i) => i.id)).toEqual(['src/app.ts'])
    expect(items.filter((i) => i.kind === 'team').map((i) => i.id)).toEqual(['游戏组', '素材组'])
    expect(items.filter((i) => i.kind === 'team').every((i) => i.group === '团队')).toBe(true)
  })

  it('前缀过滤：查询串收窄团队（也同时收窄文件）', () => {
    const items = itemsFor({ phase: 'trigger', kind: 'file', query: '游戏' }, files, [], teams)
    expect(items.map((i) => i.id)).toContain('游戏组')
    expect(items.map((i) => i.id)).not.toContain('素材组')
  })

  it('选中团队插成 @name 点名记号', () => {
    const item: PopupItem = { kind: 'team', id: '游戏组', label: '游戏组', hint: 'reviewer', group: '团队' }
    expect(applySelection('@游', { start: 0, query: '游' }, item)).toEqual({
      text: '@游戏组 ',
      caret: 5,
    })
  })
})
