/**
 * TauriAdapter：通过 Tauri 命令调用壳内的 bridge_* 命令层。
 *
 * 这是唯一的生产路径。事件走 Tauri 的 `listen`（`agent-event` 通道）。
 *
 * 运行时仍然只有**一个** client 对象、一个 app-server 进程。拆的是源码：
 * 契约按域分组（`client.ts`），实现按同样的域分组（这里），每组一份。
 * 合在一起的那个文件三百行，改终端方法要翻过设置中心的实现。
 *
 * `tauriCall.ts` 放 `invoke` 的唯一入口——"不在 Tauri 外壳里"那句报错
 * 只有一处，改文案不会漏。
 */

import { conversationApi } from './tauriConversation'
import { configApi } from './tauriConfig'
import { localApi } from './tauriLocal'
import { resourcesApi } from './tauriResources'
import { call, EVENT_CHANNEL } from './tauriCall'
import type { BridgeClient } from './client'
import type { AgentEvent, ConnectInfo } from './types'

export { EVENT_CHANNEL }

export function tauriClient(): BridgeClient {
  // 当前活跃订阅的退订函数。`subscribe` 每次都会先退掉上一条——重连会再次
  // 订阅，不清掉的话两个 Tauri 监听器同时存活，每条事件被消费两遍。
  let activeStop: (() => void) | null = null

  return {
    async connect(): Promise<ConnectInfo> {
      return call<ConnectInfo>('bridge_connect')
    },


    // 接口约定返回同步退订函数；Tauri 的 listen 是异步的，所以先返回退订桩，
    // 订阅建立后替换成真退订。调用方不必 await。
    subscribe(handler: (event: AgentEvent) => void) {
      // 先退订上一条（若有）：保证任意时刻只有一个监听器。
      activeStop?.()
      let cancelled = false
      let unlisten: (() => void) | null = null
      void import('@tauri-apps/api/event').then(async ({ listen }) => {
        if (cancelled) {
          // 退订请求来得比监听建立还早：不开始监听。
          return
        }
        const stop = await listen<AgentEvent | AgentEvent[]>(EVENT_CHANNEL, (e) => {
          if (!cancelled) {
            const payload = e.payload as AgentEvent | AgentEvent[]
            if (Array.isArray(payload)) {
              for (const event of payload) handler(event)
            } else {
              handler(payload)
            }
          }
        })
        if (cancelled) {
          // 退订请求在监听建立后到达：确保 cleanup 完成。
          await stop()
          return
        }
        unlisten = stop
      })
      const stop = () => {
        cancelled = true
        unlisten?.()
        unlisten = null
      }
      activeStop = stop
      return () => {
        stop()
        if (activeStop === stop) activeStop = null
      }
    },

    ...conversationApi(),
    ...resourcesApi(),
    ...configApi(),
    ...localApi(),
  }
}

/** 命令通道（`invoke`）的句柄，由 `bridge/session.ts` 统一持有。 */
export { call }