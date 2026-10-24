import { describe, expect, it } from 'vitest'
import { relativeToWorkspace } from './relativePath'

describe('relativeToWorkspace（文件树「添加到对话」）', () => {
  const cwd = 'D:\\projects\\my-game'

  it('工作区内路径 → 正斜杠相对路径', () => {
    expect(relativeToWorkspace(cwd, 'D:\\projects\\my-game\\assets\\hero.png')).toBe(
      'assets/hero.png',
    )
  })

  it('目录同样成立，保留原大小写', () => {
    expect(relativeToWorkspace(cwd, 'D:\\Projects\\My-Game\\scenes')).toBe('scenes')
  })

  it('工作区本身 → "."', () => {
    expect(relativeToWorkspace(cwd, 'D:\\projects\\my-game')).toBe('.')
  })

  it('工作区外的路径原样返回（绝不截断出错的相对路径）', () => {
    expect(relativeToWorkspace(cwd, 'D:\\other\\x.png')).toBe('D:\\other\\x.png')
  })

  it('没有工作区时原样返回', () => {
    expect(relativeToWorkspace(null, 'D:\\x.png')).toBe('D:\\x.png')
    expect(relativeToWorkspace('', 'D:\\x.png')).toBe('D:\\x.png')
  })

  it('前缀形近但不是目录边界时不误判（my-game2 ≠ my-game）', () => {
    expect(relativeToWorkspace(cwd, 'D:\\projects\\my-game2\\a.png')).toBe(
      'D:\\projects\\my-game2\\a.png',
    )
  })
})
