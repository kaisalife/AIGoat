import { useState } from 'react'
import clsx from 'clsx'
import { useTerminals } from '../../store/terminals'
import { useShell } from '../../store/shell'
import { TerminalInstance } from './TerminalInstance'
import { Button, StateDot, TextShimmer } from '../primitives'
import type { DockPanelProps } from '../dock/types'
import s from './TerminalTab.module.css'

/**
 * 终端 tab：多实例切换 + 新建。
 *
 * **用户终端**，不是 Agent 在沙箱里跑的命令（见 docs/10 §2）。UI 上刻意
 * 标注「用户终端」：混淆这两者会让人以为自己的命令也在走审批。
 */
export function TerminalTab({}: DockPanelProps) {
  const cwd = useShell((s) => s.cwd)
  const instances = useTerminals((s) => s.instances)
  const openId = useTerminals((s) => s.openId)
  const spawn = useTerminals((s) => s.spawn)
  const close = useTerminals((s) => s.close)
  const select = useTerminals((s) => s.select)
  const [preset, setPreset] = useState('powershell.exe')

  const current = instances.find((t) => t.id === openId) ?? instances[0] ?? null

  const start = () => {
    const argv = preset.trim().split(/\s+/).filter(Boolean)
    if (argv.length === 0 || !cwd) return
    void spawn(argv, cwd)
  }

  if (!cwd) {
    return (
      <div className={s.empty}>
        <p>先打开一个工作区，终端才有工作目录。</p>
      </div>
    )
  }

  return (
    <div className={s.tab}>
      <div className={s.bar}>
        <span className={s.kind} title="用户终端，不受回合沙箱约束">
          用户终端
        </span>
        <span className={s.strip}>
          {instances.length === 0 && <span className={s.noInstances}>没有会话</span>}
          {instances.map((t) => (
            <button
              key={t.id}
              type="button"
              className={clsx(s.chip, t.id === current?.id && s.chipOn)}
              onClick={() => select(t.id)}
              title={t.command}
            >
              <StateDot
                tone={t.status === 'failed' ? 'danger' : t.status === 'exited' ? 'neutral' : 'accent'}
                busy={t.status === 'running' || t.status === 'pending'}
                size={6}
              />
              <span className="truncate">{t.title}</span>
            </button>
          ))}
        </span>
        <Button variant="ghost" size="sm" onClick={() => close(current?.id ?? '')} disabled={!current}>
          关闭
        </Button>
      </div>

      <div className={s.launch}>
        <input
          className={s.preset}
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          aria-label="要启动的程序"
          spellCheck={false}
        />
        <Button variant="primary" size="sm" onClick={start} disabled={!preset.trim()}>
          新建会话
        </Button>
      </div>

      {current ? (
        <TerminalInstance instance={current} active />
      ) : (
        <div className={s.empty}>
          <TextShimmer>正在等第一个会话…</TextShimmer>
          <p className={s.hint}>
            默认启动 PowerShell。改成 <code>cmd.exe</code> 或{' '}
            <code>bash</code>、<code>python</code> 都可以——这里填可执行文件加参数。
          </p>
        </div>
      )}
    </div>
  )
}