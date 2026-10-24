import { describe, expect, it } from 'vitest'
import { applySelection, triggerAt, triggerSpan, type PopupItem } from './TriggerManager'

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
