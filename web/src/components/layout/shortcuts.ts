import { useEffect } from 'react'

/**
 * 快捷键注册表。
 *
 * 声明与绑定分开：`SHORTCUTS` 是**数据**（设置中心的快捷键域直接渲染它，
 * 不必在两处各写一份说明），`useShellShortcuts` 才把它接到真实的 keydown 上。
 * 新板块加快捷键只改这张表 + 在调用方补一个 handler。
 *
 * 显示用 Mod+ 风格；实际匹配按 Ctrl——这个应用只有 Windows 目标，
 * 但表里的写法留着，将来出 mac 版只改展示层。
 */
export interface ShortcutSpec {
  id: string
  keys: string
  description: string
  /**
   * 焦点在输入框/可编辑元素里时是否仍然生效（默认 false）。
   *
   * 输入框里的 Ctrl+B/Ctrl+E 本该是编辑/面板语义之外的东西被抢走会很恼人；
   * 但「打断当前回合」这类救急键必须在打字时也能按。
   */
  allowInInput?: boolean
}

export const SHORTCUTS: ShortcutSpec[] = [
  { id: 'session.new', keys: 'Ctrl+N', description: '新建会话' },
  { id: 'layout.toggleLeft', keys: 'Ctrl+B', description: '折叠 / 展开左栏' },
  { id: 'layout.toggleRight', keys: 'Ctrl+J', description: '折叠 / 展开右栏' },
  { id: 'dock.files', keys: 'Ctrl+E', description: '打开 / 关闭「文件」面板' },
  { id: 'app.settings', keys: 'Ctrl+,', description: '打开设置' },
  { id: 'turn.interrupt', keys: 'Ctrl+.', description: '打断当前回合', allowInInput: true },
]

export type ShortcutHandlers = Record<string, () => void>

/** 把 "Ctrl+Shift+P" 拆成匹配条件。表里怎么写就怎么匹配。 */
function matches(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split('+')
  const key = parts[parts.length - 1]
  return (
    event.ctrlKey === parts.includes('ctrl') &&
    event.shiftKey === parts.includes('shift') &&
    event.altKey === parts.includes('alt') &&
    event.key.toLowerCase() === key
  )
}

/** 焦点是否落在可编辑元素里（输入框 / 文本域 / 可编辑区）。 */
function inEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

/**
 * 绑定全局快捷键。
 *
 * 输入框里默认**不**劫持（`allowInInput` 逐条声明例外）——之前这里不看
 * 焦点，Ctrl+B/Ctrl+E 在打字时也会被抢走，还配合 `event.repeat` 长按连发。
 */
export function useShellShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return
      const editable = inEditableTarget(event)
      for (const spec of SHORTCUTS) {
        if (!matches(event, spec.keys)) continue
        if (editable && !spec.allowInInput) continue
        const run = handlers[spec.id]
        if (!run) continue
        event.preventDefault()
        run()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlers])
}