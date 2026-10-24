import { describe, expect, it } from 'vitest'
import { commandOutputView, KEEP_HEAD_TAIL, omittedNote } from './commandOutput'

/**
 * 命令输出的显示视图。这是流式热路径上的纯逻辑：判断错了要么白白 `split`
 * （退化成 O(n²)），要么把头尾截断算错（显示内容对不上）。
 */

const lines = (n: number): string => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n')

describe('commandOutputView', () => {
  it('空输出：empty 为真、total 为 0', () => {
    const view = commandOutputView('')
    expect(view).toEqual({ text: '', truncated: false, total: 0, empty: true })
  })

  it('短输出：不截断，且**原样返回同一引用**（省掉下游重渲染判断）', () => {
    const text = 'a\nb\nc'
    const view = commandOutputView(text)
    expect(view.truncated).toBe(false)
    expect(view.total).toBe(3)
    expect(view.text).toBe(text)
  })

  it('恰好 2×keep 行：仍不截断（边界）', () => {
    const text = lines(KEEP_HEAD_TAIL * 2)
    const view = commandOutputView(text)
    expect(view.truncated).toBe(false)
    expect(view.total).toBe(KEEP_HEAD_TAIL * 2)
    expect(view.text).toBe(text)
  })

  it('超过 2×keep 行：保留头尾各 keep 行，中间插省略说明', () => {
    const text = lines(KEEP_HEAD_TAIL * 2 + 1)
    const view = commandOutputView(text)
    expect(view.truncated).toBe(true)
    expect(view.total).toBe(KEEP_HEAD_TAIL * 2 + 1)
    expect(view.text.startsWith('line 0\n')).toBe(true)
    expect(view.text.endsWith(`line ${KEEP_HEAD_TAIL * 2}`)).toBe(true)
    expect(view.text).toContain(omittedNote(KEEP_HEAD_TAIL * 2 + 1))
  })

  it('省略的行数 = total − 2×keep', () => {
    const total = 1000
    const view = commandOutputView(lines(total))
    expect(view.text).toContain('中间 600 行已省略')
  })
})
