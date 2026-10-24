/**
 * 命令输出的显示视图（纯函数，便于单测）。
 *
 * # 为什么不用 `split('\n')` 一把梭
 *
 * 命令输出是**流式增长**的：卡片每条 delta 都会重渲染。`split('\n')` 会为
 * 每一行分配一个子串、把整段输出变成一个数组——流式下就是 O(n²) 的分配与
 * 拷贝。这里先**数**行数（只读、不分配），只有真的超过阈值、需要截断时
 * 才切分一次。
 */

/** 头尾各保留多少行。 */
export const KEEP_HEAD_TAIL = 200

export interface CommandOutputView {
  /** 要显示的文本（截断时已拼好「头 + 省略说明 + 尾」）。 */
  text: string
  /** 是否发生了中间省略。 */
  truncated: boolean
  /** 总行数（空输出为 0）。 */
  total: number
  /** 是否为空输出。 */
  empty: boolean
}

/**
 * 把累积输出转成显示视图。
 *
 * 未超过 `keep * 2` 行时**原样返回**（引用都不换，省掉下游的重渲染判断）；
 * 超过时才切分并只保留头尾各 `keep` 行，中间插一行显式说明——直接头尾相接
 * 会让人以为那就是全部输出。
 */
export function commandOutputView(text: string, keep = KEEP_HEAD_TAIL): CommandOutputView {
  const empty = text.length === 0
  const total = empty ? 0 : countLines(text)
  if (total <= keep * 2) return { text, truncated: false, total, empty }
  const lines = text.split('\n')
  const head = lines.slice(0, keep).join('\n')
  const tail = lines.slice(-keep).join('\n')
  return { text: `${head}\n${omittedNote(total, keep)}\n${tail}`, truncated: true, total, empty }
}

/** 行数 = 换行符数 + 1。只读一遍、不分配数组。 */
function countLines(text: string): number {
  let lines = 1
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) lines += 1
  }
  return lines
}

/** 中间省略说明。指向 Trajectory 账本——那里有全量。 */
export function omittedNote(total: number, keep = KEEP_HEAD_TAIL): string {
  return `… 中间 ${total - keep * 2} 行已省略（全量见 Trajectory 账本）…`
}
