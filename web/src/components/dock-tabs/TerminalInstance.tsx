import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useTerminals, type TerminalInstance } from '../../store/terminals'
import { Button, StateDot } from '../primitives'
import s from './TerminalInstance.module.css'

export interface TerminalInstanceProps {
  instance: TerminalInstance
  active: boolean
}

/** resize 节流间隔。PTY 尺寸跟着鼠标拖动变，60ms 一次足够且不刷屏。 */
const RESIZE_THROTTLE = 60

/**
 * 单个终端实例：等宽流式输出 + 行缓冲输入。
 *
 * # 输入的局限（刻意不做）
 *
 * **没有 readline**：方向键翻历史、Tab 补全、全局快捷键都没有。回车发送
 * 整行缓冲区。这是明确的取舍——完整的行编辑要么引 xterm.js，要么自己实现
 * 一套光标状态机，两者都不如先把"能跑起一个 shell"做扎实。要补的时候，
 * 这里就是唯一的改动点。
 *
 * Ctrl+C 发 `\x03`（tty 下的中断字符），不是调 terminate——
 * 前者让进程自己收尾（能留下 atexit 输出），后者是强杀。
 */
export function TerminalInstance({ instance, active }: TerminalInstanceProps) {
  const write = useTerminals((st) => st.write)
  const resize = useTerminals((st) => st.resize)
  const terminate = useTerminals((st) => st.terminate)
  const [buffer, setBuffer] = useState('')
  const body = useRef<HTMLPreElement | null>(null)
  const pinned = useRef(true)

  // 贴底滚动：用户在往上翻历史时不抢（跟消息流同一条规则）。
  useLayoutEffect(() => {
    const el = body.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [instance.output])

  // resize 节流：只在可见（active）时报，空闲的实例别白发。
  const surface = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = surface.current
    if (!el || !active) return
    let timer = 0
    const send = () => {
      timer = 0
      const rect = el.getBoundingClientRect()
      // 按 8×16 的等宽字符尺寸估算行列数：tty 只认行列，不认像素。
      const cols = Math.max(20, Math.floor(rect.width / 8))
      const rows = Math.max(6, Math.floor(rect.height / 16))
      resize(instance.id, rows, cols)
    }
    const observer = new ResizeObserver(() => {
      if (timer) return
      timer = window.setTimeout(send, RESIZE_THROTTLE)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timer) window.clearTimeout(timer)
    }
  }, [active, instance.id, resize])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (instance.ended) return
    if (e.key === 'Enter') {
      write(instance.id, `${buffer}\r`)
      setBuffer('')
      return
    }
    if (e.key === 'c' && e.ctrlKey) {
      // tty 的行中断字符：让进程自己收尾，而不是把进程杀了
      write(instance.id, '\x03')
      e.preventDefault()
      pinned.current = true
      return
    }
    // 其余按键交给 input 自己处理（可编辑区域）
  }

  return (
    <div ref={surface} className={s.instance} data-ended={instance.ended || undefined}>
      <div className={s.header}>
        <StateDot
          tone={instance.status === 'failed' ? 'danger' : instance.status === 'exited' ? 'neutral' : 'accent'}
          busy={instance.status === 'running' || instance.status === 'pending'}
          size={7}
        />
        <span className={s.title} title={instance.command}>
          {instance.title}
        </span>
        {/* 重载挂回来的终端没有输出可补（输出走事件流，那时就断了）。
            不明说的话，用户看到的是一个空白终端，会以为输出丢了或进程崩了——
            而实际上进程还活着、还能打字。 */}
        {instance.reattached && <span className={s.reattached}>输出不可恢复</span>}
        {instance.ended && instance.exitCode !== undefined && (
          <span className={clsx(s.exit, instance.exitCode !== 0 && s.exitBad)}>
            exit {instance.exitCode}
          </span>
        )}
        <span className={s.spacer} />
        {!instance.ended && (
          <Button variant="ghost" size="sm" onClick={() => void terminate(instance.id)}>
            结束
          </Button>
        )}
      </div>

      <pre
        ref={body}
        className={s.output}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
      >
        {instance.output}
        {!instance.ended && <span className={s.cursor} aria-hidden="true" />}
      </pre>

      {instance.error && <p className={s.error}>{instance.error}</p>}

      <div className={s.inputRow}>
        <span className={s.prompt} aria-hidden="true">
          {instance.ended ? '·' : '>'}
        </span>
        <input
          className={s.input}
          value={buffer}
          disabled={instance.ended}
          onChange={(e) => setBuffer(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            instance.ended
              ? `进程已结束${instance.cwd ? ` · ${instance.cwd}` : ''}`
              : '输入命令，回车发送；Ctrl+C 中断'
          }
          aria-label={`${instance.title} 的输入`}
        />
      </div>
    </div>
  )
}