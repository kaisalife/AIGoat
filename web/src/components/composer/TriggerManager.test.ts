import { describe, expect, it } from 'vitest'
import {
  applySelection,
  itemsFor,
  triggerAt,
  triggerSpan,
  type MemberCandidate,
  type PopupItem,
  type SkillCandidate,
  type TeamCandidate,
} from './TriggerManager'
import { pickerQuery } from './items'

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
    // 不用 `team`：那是 `/team` 选择器命令的别名，会把列表换成团队
    // （技能侧改用 `/skill team`）。
    const items = itemsFor({ phase: 'trigger', kind: 'command', query: 'build' }, [], skills, [])
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

/**
 * 选择器命令：`/skill`、`/file`。
 *
 * 这两个命令不是"执行一个动作"，而是"把候选摆出来"：命令名之后的部分是
 * 过滤词。修复前它们只把 `/skill ` 插进输入框就关掉弹层，用户看不到任何
 * 技能——等于要求先背下技能名。
 */
describe('选择器命令 /skill 与 /file', () => {
  const skills: SkillCandidate[] = [
    { name: 'team-builder', description: '组建团队' },
    { name: 'review-code', description: '代码评审' },
  ]
  const files = [{ path: 'src/app.ts', name: 'app.ts' }]

  it('/skill 直接列出技能，不混本地命令', () => {
    const items = itemsFor({ phase: 'trigger', kind: 'command', query: 'skill' }, files, skills, [])
    expect(items.map((i) => i.kind)).toEqual(['skill', 'skill'])
    expect(items.every((i) => i.group === '技能')).toBe(true)
  })

  it('/skill team 用命令名之后的词过滤', () => {
    const items = itemsFor(
      { phase: 'trigger', kind: 'command', query: 'skill team' },
      files,
      skills,
      [],
    )
    expect(items.map((i) => i.id)).toEqual(['team-builder'])
  })

  it('/file 列出文件候选', () => {
    const items = itemsFor({ phase: 'trigger', kind: 'command', query: 'file' }, files, skills, [])
    expect(items.map((i) => i.kind)).toEqual(['file'])
  })

  it('选中 /skill 时不插尾随空格（触发段保持打开）', () => {
    const item: PopupItem = { kind: 'command', id: 'skill', label: '/skill', group: '文件' }
    expect(applySelection('/skill', { start: 0, query: 'skill' }, item)).toEqual({
      text: '/skill',
      caret: 6,
    })
  })

  it('选中技能时替换整段 /skill 查询', () => {
    const item: PopupItem = { kind: 'skill', id: 'team-builder', label: '$team-builder', group: '技能' }
    expect(applySelection('/skill team', { start: 0, query: 'skill team' }, item)).toEqual({
      text: '$team-builder ',
      caret: 14,
    })
  })
})

/**
 * 选择器命令：`/team`（选团队）与 `/per`（选人，用 TA 的能力）。
 *
 * 两者都插 `@name `——团队是整队协作，人员是用这个人的能力，记号相同，
 * 语义由注入的派单说明解释。
 */
describe('选择器命令 /team 与 /per', () => {
  const teams: TeamCandidate[] = [{ name: '游戏组', hint: 'reviewer / builder' }]
  const members: MemberCandidate[] = [
    { name: 'reviewer', hint: '素材质量评审' },
    { name: 'sage', hint: '策划' },
  ]

  it('/team 只列团队', () => {
    const items = itemsFor(
      { phase: 'trigger', kind: 'command', query: 'team' },
      [],
      [],
      teams,
      members,
    )
    expect(items.map((i) => i.kind)).toEqual(['team'])
    expect(items[0]?.group).toBe('团队')
  })

  it('/per 只列人员，职责也参与过滤', () => {
    const all = itemsFor(
      { phase: 'trigger', kind: 'command', query: 'per' },
      [],
      [],
      teams,
      members,
    )
    expect(all.map((i) => i.kind)).toEqual(['member', 'member'])
    expect(all.every((i) => i.group === '人员')).toBe(true)

    const filtered = itemsFor(
      { phase: 'trigger', kind: 'command', query: 'per 评审' },
      [],
      [],
      teams,
      members,
    )
    expect(filtered.map((i) => i.id)).toEqual(['reviewer'])
  })

  it('选中人员插 @name（点名用 TA 的能力）', () => {
    const item: PopupItem = { kind: 'member', id: 'sage', label: 'sage', group: '人员' }
    expect(applySelection('/per sage', { start: 0, query: 'per sage' }, item)).toEqual({
      text: '@sage ',
      caret: 6,
    })
  })

  it('选中 /team /per 时不插尾随空格（候选接上）', () => {
    const team: PopupItem = { kind: 'command', id: 'team', label: '/team', group: '文件' }
    expect(applySelection('/team', { start: 0, query: 'team' }, team)).toEqual({
      text: '/team',
      caret: 5,
    })
    const per: PopupItem = { kind: 'command', id: 'per', label: '/per', group: '文件' }
    expect(applySelection('/per', { start: 0, query: 'per' }, per)).toEqual({
      text: '/per',
      caret: 4,
    })
  })

  it('/per 不会吃掉 /permission', () => {
    expect(pickerQuery('permission')).toBeNull()
    expect(pickerQuery('per')).toEqual({ kind: 'per', query: '' })
  })
})
