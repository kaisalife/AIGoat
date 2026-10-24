/**
 * 桥接连接的单一所有者。
 *
 * 两个 store（shell 管对话、resources 管右栏）必须共用**同一条**连接：
 * 各建一份会得到两个 app-server 进程、两套事件流，状态永远对不上。
 *
 * 生产形态只有一条路径：Tauri 命令层（`bridge_*`）+ `agent-event` 事件通道。
 */

import type { BridgeClient } from './client'
import { tauriClient } from './tauri'

let current: BridgeClient | null = null

export function getClient(): BridgeClient {
  if (!current) current = tauriClient()
  return current
}
