/**
 * 跨面板向 composer 注入文本的桥（文件树右键「添加到对话」等）。
 *
 * dock 面板与 composer 之间隔着一整套通用 dock 系统，prop drilling 要穿
 * 三层泛型组件；一个两字段的桥 store 比那便宜得多。`seq` 允许连续插入
 * 同一段文本（同值也能触发 effect）。
 */
import { create } from 'zustand'

interface ComposerBridgeState {
  pending: { text: string; seq: number } | null
  requestInsert: (text: string) => void
  consumeInsert: () => void
}

let seq = 0

export const useComposerBridge = create<ComposerBridgeState>()((set) => ({
  pending: null,
  requestInsert(text) {
    seq += 1
    set({ pending: { text, seq } })
  },
  consumeInsert() {
    set({ pending: null })
  },
}))
