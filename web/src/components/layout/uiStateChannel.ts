import { getClient } from '../../bridge/session'
import type { UiStateRecord } from '../../bridge/client'

/**
 * `ui-state.json` 的前端通道。
 *
 * 为什么不直接用 localStorage（00 铁律「配置落盘」）：WebView 的存储落
 * C 盘 AppData，和 settings.json / workspaces.json 各散各处，用户既找不到
 * 也备份不了。这个通道让界面状态和别的配置落在同一个目录里。
 *
 * 写盘策略：**500ms 防抖**。拖拽列宽会连续触发上百次变更，
 * 每次都写文件既费电也容易在慢盘上卡住；拖拽结束时 `flush` 立刻落一次。
 */

const SAVE_DEBOUNCE_MS = 500

let cache: UiStateRecord | null = null
let timer: number | null = null
let dirty = false

/** 读回整个文件（首次读后缓存在内存里，后续 patch 都在这份上合并）。 */
export async function readUiState(): Promise<UiStateRecord> {
  if (cache) return cache
  try {
    cache = await getClient().loadUiState()
  } catch {
    cache = {}
  }
  return cache
}

/** 合并一段顶层键并安排落盘。调用方不必关心防抖。 */
export function patchUiState(patch: Partial<UiStateRecord>): void {
  cache = { ...(cache ?? {}), ...patch }
  dirty = true
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(() => void flushUiState(), SAVE_DEBOUNCE_MS)
}

/** 立刻落盘。拖拽结束、窗口关闭前调。 */
export async function flushUiState(): Promise<void> {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
  if (!dirty || !cache) return
  dirty = false
  try {
    await getClient().saveUiState(cache)
  } catch {
    // 落盘失败只影响下次启动的还原，不该打断当下操作——重新标脏，
    // 下一次 patch 会再试一次。
    dirty = true
  }
}

/**
 * 让出控制权的最后一刻把状态写下去。
 *
 * 桌面应用没有可靠的「关闭前」事件（窗口 X、任务管理器结束都有），
 * 所以额外挂 beforeunload：能写成就写，写不成就等下次 500ms 防抖。
 */
export function watchUiStateUnload(): () => void {
  const onUnload = () => {
    if (!dirty || !cache) return
    void getClient().saveUiState(cache)
  }
  window.addEventListener('beforeunload', onUnload)
  return () => window.removeEventListener('beforeunload', onUnload)
}