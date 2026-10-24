import { describe, expect, it, vi } from 'vitest'
import { registerCommand, type CommandSpec } from '../../commands/registry'
import { dispatchCommandLine } from './useComposerSubmit'

/**
 * 命令派发回归测试。
 *
 * 修复前 `dispatchCommandLine` 要求消息**最后一个字符**是 `/` 或 `@`，
 * 于是 `/compact`、`/plan 帮我加缓存` 全都识别不了，被当普通消息发给模型。
 * 现在判据是「消息以 /命令名 开头」。
 */
function fakeExecuteCommand(): { spec: CommandSpec; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn()
  const spec: CommandSpec = {
    id: '__test_exec',
    title: '测试命令',
    group: '会话',
    hint: '',
    dispatch: 'execute',
    run,
  }
  registerCommand(spec)
  return { spec, run }
}

/** 任意派发类型的命令，只为断言它到底有没有被执行。 */
function fakeCommand(id: string, dispatch: CommandSpec['dispatch']): ReturnType<typeof vi.fn> {
  const run = vi.fn()
  registerCommand({ id, title: id, group: '会话', hint: '', dispatch, run })
  return run
}

describe('dispatchCommandLine', () => {
  it('识别带参数的命令并执行，参数原样交给 run', () => {
    const { run } = fakeExecuteCommand()
    expect(dispatchCommandLine('/__test_exec 帮我加上缓存')).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith({ text: '帮我加上缓存' })
  })

  it('识别无参数命令', () => {
    const { run } = fakeExecuteCommand()
    expect(dispatchCommandLine('/__test_exec')).toBe(true)
    expect(run).toHaveBeenCalledWith({ text: '' })
  })

  it('未知命令不消费（仍作为普通消息发给模型）', () => {
    expect(dispatchCommandLine('/definitely_not_a_command')).toBe(false)
  })

  it('命令不在行首时不消费', () => {
    expect(dispatchCommandLine('请执行 /__test_exec')).toBe(false)
  })

  it('普通文本不消费', () => {
    expect(dispatchCommandLine('普通的一条消息')).toBe(false)
  })

  // 回归：弹层选中命令只是把 `/<id> ` 插进输入框、**不执行**，所以三类命令
  // 都必须在提交时由这里执行。修复前只执行 `execute` 类，`popupSelect` /
  // `action` 类（/compact、/export、/goal…）被消费却不执行——静默无操作。
  it('popupSelect 类命令也在这里执行', () => {
    const run = fakeCommand('__test_popup', 'popupSelect')
    expect(dispatchCommandLine('/__test_popup')).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('action 类命令也在这里执行', () => {
    const run = fakeCommand('__test_action', 'action')
    expect(dispatchCommandLine('/__test_action')).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('命令后跟文本时文本交给 run（/goal 这类用法）', () => {
    const run = fakeCommand('__test_popup2', 'popupSelect')
    expect(dispatchCommandLine('/__test_popup2 把缓存加上')).toBe(true)
    expect(run).toHaveBeenCalledWith({ text: '把缓存加上' })
  })
})
