/**
 * 条目的公共基座。
 *
 * 单独成文件是为了打断 `entries.ts` ↔ `hostEntries.ts` 的循环引用：
 * 两边都要用 `Base`，而 `Entry` 联合又同时包含两边的类型。
 */

export interface Base {
  /** 稳定的 React key。优先用 itemId，其次用事件自带 id，最后退回序号。 */
  id: string
  at: number
  /** 所属回合序号（0 起）。turn rail、折叠分组都按它切块。 */
  turn: number
}