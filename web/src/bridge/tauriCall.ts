/**
 * Tauri invoke 的唯一入口（各 impl 分片共用）。
 *
 * 找不到 `__TAURI_INTERNALS__` 时**明确报错**：这个应用只能跑在 Tauri
 * 外壳里，静默失败会让人以为是后端挂了。
 */

interface TauriInternals {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
}

interface TauriGlobal {
  __TAURI_INTERNALS__?: TauriInternals
  __TAURI__?: unknown
}

/** 事件通道名。必须与 Rust 侧 `codex::EVENT_CHANNEL` 一致。 */
export const EVENT_CHANNEL = 'agent-event'

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function internals(): TauriInternals {
  // 先判 window：直接在 SSR/测试/非 DOM 环境取全局属性会抛
  // `ReferenceError: window is not defined`，把友好的提示文案绕过去。
  if (typeof window === 'undefined') {
    throw new Error('不在 Tauri 外壳里：请通过 AIGoat.exe（或 cargo run）启动应用。')
  }
  const i = (window as unknown as TauriGlobal).__TAURI_INTERNALS__
  if (!i) {
    throw new Error('不在 Tauri 外壳里：请通过 AIGoat.exe（或 cargo run）启动应用。')
  }
  return i
}

export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return internals().invoke<T>(cmd, args)
}