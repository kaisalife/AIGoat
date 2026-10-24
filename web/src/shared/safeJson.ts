/**
 * 将未知值安全地序列化为格式化 JSON。
 *
 * 用于调试视图、payload 检查器、以及任何需要展示原始数据的场景。
 * 与直接 `JSON.stringify` 的区别：遇到循环引用或不可序列化的值时
 * 不会抛异常，而是退回 `String(value)`。
 */

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
