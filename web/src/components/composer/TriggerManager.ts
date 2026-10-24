/**
 * 触发符状态机（08 号板块 §3.2，照抄 dsh 三态）。
 *
 * ```
 * idle --键入 '/' 或 '@'--> trigger --选择--> selected --继续键入--> trigger
 * trigger --Esc--> idle；selected --发送--> execute（本地执行，不发给模型）
 * ```
 *
 * # 为什么状态机在这里而不在组件里
 *
 * 三态之间的转移有**跨组件**的约束：弹层开着时必须拦住 composer 的
 * Enter（否则会把命令名当消息发出去），弹层关了要立刻归还。把这些规则
 * 收在一个纯函数里，测试它不需要渲染任何东西。
 */

import { commandItems, fileItems, type FileNode } from './items'

export type { FileNode } from './items'

/** 触发符种类。`@` 与 `/` 的弹层内容不同，但状态机相同。 */
export type TriggerKind = 'command' | 'file'

export type TriggerState =
  | { phase: 'idle' }
  | { phase: 'trigger'; kind: TriggerKind; /** 触发符之后已输入的查询串 */ query: string }
  | { phase: 'selected'; kind: TriggerKind; /** 已选中的条目 */ item: PopupItem }

/** 弹层里的一条。命令与文件混用同一形状，键盘模型才能共用。 */
export interface PopupItem {
  kind: TriggerKind
  /** 命令 id 或文件路径。 */
  id: string
  label: string
  hint?: string
  /** 分组标题（弹层按它分段，sticky 头）。 */
  group: string
}

export interface TriggerMachine {
  state: TriggerState
  /** 弹层是否开着（trigger 或 selected 都在开）。 */
  open: boolean
  /** 当前高亮的条目下标。 */
  cursor: number
  items: PopupItem[]
  /** 处理一次按键。返回 true 表示这个键被弹层吃掉了。 */
  handle: (key: string, text: string, caret: number, files: FileNode[]) => TriggerState | null
  reset: () => void
}

/** 触发符本身。`@` 与 `/` 的弹层内容不同，但状态机相同。 */
const SLASH = '/'
const AT = '@'

/** 取某触发符下的条目。 */
export function itemsFor(state: TriggerState, files: FileNode[]): PopupItem[] {
  if (state.phase === 'trigger') {
    return state.kind === 'command' ? commandItems(state.query) : fileItems(state.query, files)
  }
  if (state.phase === 'selected') {
    return state.kind === 'command' ? commandItems('') : fileItems('', files)
  }
  return []
}

/**
 * 状态机本体。
 *
 * `handle` 返回新状态；返回 `null` 表示"这个键不归我管"，交回 composer。
 */
export function createTriggerMachine(): TriggerMachine {
  let state: TriggerState = { phase: 'idle' }
  let cursor = 0
  let items: PopupItem[] = []

  const reset = () => {
    state = { phase: 'idle' }
    cursor = 0
    items = []
  }

  return {
    get state() {
      return state
    },
    get open() {
      return state.phase !== 'idle'
    },
    get cursor() {
      return cursor
    },
    get items() {
      return items
    },
    reset,

    handle(key, text, caret, files) {
      // onKeyDown 在字符插入**之前**触发，所以先把这个键的效果算进文本，
      // 再去找触发符——否则查询串永远停在 ''，弹层不会随打字收窄。
      let nextText = text
      let nextCaret = caret
      if (key === 'Backspace') {
        nextText = text.slice(0, Math.max(0, caret - 1)) + text.slice(caret)
        nextCaret = Math.max(0, caret - 1)
      } else if (key.length === 1) {
        nextText = text.slice(0, caret) + key + text.slice(caret)
        nextCaret = caret + 1
      }

      // Esc：弹层开着就关掉。
      if (key === 'Escape' && state.phase !== 'idle') {
        reset()
        return state
      }

      const span = triggerAt(nextText, nextCaret)
      if (!span) {
        // 触发区间已不存在（打了空格、删掉触发符…）：关掉弹层，按键交回
        // composer 落进输入框（不能 preventDefault，否则会吞掉这个字符）。
        if (state.phase !== 'idle') reset()
        return null
      }

      // 打开 / 更新 trigger 态：query 会跟着打字实时变化。
      state = { phase: 'trigger', kind: span.kind, query: span.query }
      items = itemsFor(state, files)
      if (cursor >= items.length) cursor = 0

      // ↑↓ 移动、Enter/Tab 选中：这些键要弹层自己消费（不能落进输入框）。
      if (key === 'ArrowDown') {
        cursor = items.length === 0 ? 0 : (cursor + 1) % items.length
        return state
      }
      if (key === 'ArrowUp') {
        cursor = items.length === 0 ? 0 : (cursor - 1 + items.length) % items.length
        return state
      }
      if (key === 'Enter' || key === 'Tab') {
        const item = items[cursor]
        if (!item) return state // 没有候选：留在弹层，不提交
        state = { phase: 'selected', kind: item.kind, item }
        cursor = 0
        items = itemsFor(state, files)
        return state
      }
      // 可打印字符 / 退格：状态已更新，但按键要交给 composer 落文本。
      return null
    },
  }
}

/**
 * 在光标前找触发符那一段。
 *
 * 从 caret-1 往前扫：碰到触发符（且它在行首或空白之后）就返回它的位置与
 * 查询串；先碰到空白说明这段里没有触发符。**不要求触发符紧贴光标**——
 * 这样 `/pl` 或 `@src/app` 这种已经输入了查询串的情况也能正确识别（选择
 * 替换需要替换掉整段，而不是只认空查询）。
 */
export function triggerAt(
  text: string,
  caret: number,
): { kind: TriggerKind; start: number; query: string } | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i]
    if (ch === undefined) return null
    if (ch === SLASH || ch === AT) {
      const prev = text[i - 1]
      if (i > 0 && prev !== undefined && !/\s/.test(prev)) return null
      return {
        kind: ch === AT ? 'file' : 'command',
        start: i,
        query: text.slice(i + 1, caret),
      }
    }
    if (/\s/.test(ch)) return null
  }
  return null
}

/**
 * 保留旧签名：从输入框文本里取出触发符那一段。
 *
 * 选择替换（`pick`）要拿到 `{start, query}`。实现委托给 `triggerAt`，
 * 这样“弹层筛选”和“替换哪一段”用的是同一套判据，不会各写一份而漂移。
 */
export function triggerSpan(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const at = triggerAt(text, caret)
  return at ? { start: at.start, query: at.query } : null
}

/** 选中项要**替换**掉输入框里的那一段，而不是追加在后面。 */
export function applySelection(
  text: string,
  span: { start: number; query: string } | null,
  item: PopupItem,
): { text: string; caret: number } {
  const replacement = item.kind === 'command' ? `/${item.id} ` : `[${item.label}] `
  const start = span?.start ?? text.length
  // 触发段 = 触发符(1 个字符) + 查询串，它的结束位置正好是光标处。
  // **必须保留**这段之后的文本：光标后面还有字时（在句子中间敲 `/` 或 `@`），
  // 早先的实现从 `start` 一刀切到结尾，会把后面的内容整段删掉。
  const end = span ? span.start + 1 + span.query.length : text.length
  return {
    text: text.slice(0, start) + replacement + text.slice(end),
    caret: start + replacement.length,
  }
}