/**
 * 终端实例的状态（10 号板块）。
 *
 * # 为什么输出不走 shell store
 *
 * 输出是高频的（每帧都可能来一条 delta），而会话事件虽然也高频但语义
 * 完全不同。混在一个 store 里会出现两个后果：消息流跟着终端输出重渲染，
 * 以及切会话时把终端输出一起清掉。所以独立一个 store。
 *
 * # 与 codex 的关系
 *
 * 进程跑在 **codex 那边**（`command/exec`），前端只是它的显示器。所以：
 * - 切会话**不清**终端（终端是工作区级的，不是会话级的）
 * - 应用重载后进程还在，但输出流已经接不回来了——重挂列在 10 号文件二期
 */

import { create } from 'zustand'
import { getClient } from '../bridge/session'

export type TerminalStatus = 'pending' | 'running' | 'exited' | 'failed'

/** 输出保留上限（字符）。超了从头截——终端里没人回头看十万行以前。 */
const MAX_CHARS = 400_000

export interface TerminalInstance {
  /** 与 codex 的关联键（前端指定，见 §5.6）。 */
  id: string
  /** 展示名，默认取命令行首段。 */
  title: string
  command: string
  cwd: string
  status: TerminalStatus
  output: string
  /** null = 协议没给（非零退出码才有意义，null 当"不知道"而不是 0）。 */
  exitCode?: number | null
  error?: string
  /** 进程结束后才允许再发输入。 */
  ended: boolean
  /**
   * 重载后从 codex 侧清单挂回来的（见 store/terminalReattach.ts）。
   *
   * 这类终端**没有输出可补**——输出走事件流，重载时已经断了。所以界面上
   * 应当明说，而不是给用户一个空白终端让人以为输出丢了或程序崩了。
   *
   * 之前这个字段只写不读、也没在类型上声明：`reattachOrphans` 整个函数
   * 从没被调用过，所以没人发现它是个哑字段。
   */
  reattached?: boolean
}

interface TerminalState {
  instances: TerminalInstance[]
  openId: string | null
  spawn: (command: string[], cwd: string) => Promise<string>
  write: (id: string, data: string) => void
  resize: (id: string, rows: number, cols: number) => void
  terminate: (id: string) => Promise<void>
  close: (id: string) => void
  select: (id: string) => void
  /** 收一条 `terminalEvent`。 */
  ingest: (event: TerminalEventLike) => void
}

/**
 * `AgentEvent` 里 terminalEvent 的最小形状。
 *
 * 只声明这里真用到的字段（不给 `AgentEventBase` 也不 import 整个联合）：
 * 收事件的入口对上游多发几个字段天然容忍——多出来的键被忽略即可，
 * 少一个用到的字段才会出事。
 */
export interface TerminalEventLike {
  type: 'terminalEvent'
  execId: string
  stream?: string
  delta?: string
  exitCode?: number | null
  stdout?: string | null
  stderr?: string | null
  exited?: boolean
  error?: string
}

let seq = 0

export const useTerminals = create<TerminalState>()((set, get) => ({
  instances: [],
  openId: null,

  async spawn(argv, cwd) {
    seq += 1
    const id = `t${seq}-${Date.now().toString(36)}`
    const instance: TerminalInstance = {
      id,
      title: argv[0] ?? 'shell',
      command: argv.join(' '),
      cwd,
      status: 'pending',
      output: '',
      ended: false,
    }
    set((s) => ({ instances: [...s.instances, instance], openId: id }))

    try {
      await getClient().terminalExec(id, argv, cwd, true)
      // 命令立即返回（见 Rust 侧注释），所以这里只能记「已提交」。
      // 真正定态要等首个 outputDelta 或退出事件。
      patch(id, { status: 'running' })
    } catch (err) {
      patch(id, { status: 'failed', error: describe(err), ended: true })
    }
    return id
  },

  write(id, data) {
    const instance = get().instances.find((t) => t.id === id)
    if (!instance || instance.ended) return
    // fire-and-forget：stdin 写失败不该打断用户输入
    void getClient().terminalWrite(id, data).catch((err) => patch(id, { error: describe(err) }))
  },

  resize(id, rows, cols) {
    // 节流在调用方（TerminalInstance 的 ResizeObserver），这里只转发。
    void getClient()
      .terminalResize(id, rows, cols)
      .catch((err) => patch(id, { error: describe(err) }))
  },

  async terminate(id) {
    try {
      await getClient().terminalTerminate(id)
    } catch (err) {
      patch(id, { error: describe(err), ended: true, status: 'failed' })
    }
  },

  close(id) {
    set((s) => {
      const instances = s.instances.filter((t) => t.id !== id)
      return {
        instances,
        // 关掉当前活动的那一个时，活动权交给剩下的第一个；没有就变 null
        // （DockShell 会据此显示 guide 空态页）。
        openId: s.openId === id ? (instances[0]?.id ?? null) : s.openId,
      }
    })
  },

  select(id) {
    set({ openId: id })
  },

  ingest(event) {
    const id = event.execId
    const instance = get().instances.find((t) => t.id === id)
    if (!instance) return

    if (event.exited) {
      // 退出是定态事件：先把同帧排队的增量落进 output，再打退出补丁，
      // 否则退出应答里的残留 stdout 会插到还没落盘的 delta 前面。
      flushNow()
      patch(id, {
        status: event.error ? 'failed' : 'exited',
        exitCode: event.exitCode,
        error: event.error,
        ended: true,
        // 最终应答里的 stdout/stderr 只在被截断时才有内容（流式模式下为空），
        // 但仍要拼上——服务端可能因为竞态没发全。
        output: append(instance.output, tail(event.stdout, event.stderr)),
      })
      return
    }
    if (event.delta) {
      queueDelta(id, event.delta)
    }
  },
}))

function patch(id: string, changes: Partial<TerminalInstance>): void {
  useTerminals.setState((s) => ({
    instances: s.instances.map((t) => (t.id === id ? { ...t, ...changes } : t)),
  }))
}

/**
 * 输出增量的**同帧合并**。
 *
 * 终端输出是最高频的流（跑一个构建每秒能来几百条 delta），而每次更新都要
 * `current + chunk` 复制整个缓冲（上限 40 万字符）。不合并的话追加是 O(n²)
 * 的，还会拖着整棵 dock 重渲染。这里把同一帧内的 delta 攒起来，一帧最多
 * 落一次盘——事件率再高，store 更新频率也封顶在帧率。
 */
const pendingDeltas = new Map<string, string>()
let flushScheduled = false

function queueDelta(id: string, chunk: string): void {
  const queued = pendingDeltas.get(id)
  pendingDeltas.set(id, queued ? queued + chunk : chunk)
  if (flushScheduled) return
  flushScheduled = true
  const schedule =
    typeof requestAnimationFrame === 'function'
      ? (cb: () => void) => requestAnimationFrame(cb)
      : (cb: () => void) => setTimeout(cb, 16)
  schedule(flushNow)
}

function flushNow(): void {
  if (pendingDeltas.size === 0) {
    flushScheduled = false
    return
  }
  flushScheduled = false
  const batch = new Map(pendingDeltas)
  pendingDeltas.clear()
  useTerminals.setState((s) => ({
    instances: s.instances.map((t) => {
      const chunk = batch.get(t.id)
      if (!chunk) return t
      return { ...t, output: append(t.output, chunk), status: t.ended ? t.status : 'running' }
    }),
  }))
}

/** 追加并按上限截断。终端的输出没有上限时会吃光内存。 */
function append(current: string, chunk: string | undefined): string {
  if (!chunk) return current
  const next = current + chunk
  // 截断留 1/4 余量、超了才做一次：每条 delta 都 slice 一遍 40 万字符
  // 会把追加重新变成 O(n²)。
  return next.length > MAX_CHARS + MAX_CHARS / 4
    ? next.slice(next.length - MAX_CHARS)
    : next
}

/** `command/exec` 的最终应答里 stdout/stderr 只在被截断时有内容。 */
function tail(stdout?: string | null, stderr?: string | null): string {
  if (!stdout && !stderr) return ''
  return [stdout, stderr].filter(Boolean).join('')
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}