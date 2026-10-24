/**
 * `/` 菜单候选的统一排序（移植自 dsh `ui-primitives/rank-by-name.ts`）。
 *
 * 规则：query 是候选 `name`（或其 `label`）的大小写不敏感**有序子序列**。
 * 前缀命中的排最前，其次按最强对齐分（边界处与相邻字符命中加权、跳字与
 * 前导字符扣分），同分保持源顺序。空查询原样返回输入列表。
 */

/** 一次匹配：候选、稳定源位置、是否前缀命中、对齐分。 */
interface Ranked<T> {
  readonly item: T
  readonly index: number
  readonly prefix: boolean
  readonly score: number
}

/** 名字开头与分隔符边界的额外权重。 */
function boundaryBonus(name: string, index: number): number {
  return index === 0 || name.charAt(index - 1) === '-' || name.charAt(index - 1) === '_' ? 8 : 0
}

/**
 * O(name × query) 求最强有序子序列对齐。边界与相邻命中加分，跳字与前导
 * 字符扣分；query 不是 name 的子序列时返回 undefined。
 */
function alignmentScore(name: string, query: string): number | undefined {
  if (query.length > name.length) return undefined
  const noMatch = Number.NEGATIVE_INFINITY
  let previous = Array<number>(name.length).fill(noMatch)
  for (let index = 0; index < name.length; index++) {
    if (name.charAt(index) === query.charAt(0)) previous[index] = 1 + boundaryBonus(name, index) - index
  }
  for (let queryIndex = 1; queryIndex < query.length; queryIndex++) {
    const current = Array<number>(name.length).fill(noMatch)
    // 扫一遍上一行：`left` 是退一个字符的相邻延续分，`leftLeft` 是退两个
    // 字符的最早跳字分。
    let left = noMatch
    let leftLeft = noMatch
    let bestGapped = noMatch
    for (const [index, prior] of previous.entries()) {
      if (leftLeft !== noMatch) bestGapped = Math.max(bestGapped, leftLeft + index - 2)
      if (name.charAt(index) === query.charAt(queryIndex)) {
        const bonus = 1 + boundaryBonus(name, index)
        let score = noMatch
        if (left !== noMatch) score = left + bonus + 4
        if (bestGapped !== noMatch) score = Math.max(score, bestGapped + bonus + 1 - index)
        current[index] = score
      }
      leftLeft = left
      left = prior
    }
    previous = current
  }
  let best = noMatch
  for (const score of previous) best = Math.max(best, score)
  return best === noMatch ? undefined : best
}

/**
 * 按菜单查询给候选排序。
 * @param items - 源顺序的候选（命令注册表顺序、文件树顺序）。
 * @param rawQuery - 触发符之后输入的文本，大小写不敏感匹配。
 * @returns 命中的候选：前缀命中优先，其次对齐分，再按源顺序。
 * 空查询原样返回输入列表。
 */
export function rankByName<T extends { readonly name: string; readonly label?: string }>(
  items: readonly T[],
  rawQuery: string,
): readonly T[] {
  const query = rawQuery.toLowerCase()
  if (query === '') return items
  const ranked: Ranked<T>[] = []
  items.forEach((item, index) => {
    const keys = item.label === undefined ? [item.name] : [item.name, item.label]
    let prefix = false
    let score: number | undefined
    for (const key of keys) {
      const lower = key.toLowerCase()
      const keyScore = alignmentScore(lower, query)
      if (keyScore === undefined) continue
      prefix ||= lower.startsWith(query)
      score = score === undefined ? keyScore : Math.max(score, keyScore)
    }
    if (score !== undefined) ranked.push({ item, index, prefix, score })
  })
  ranked.sort((left, right) =>
    Number(right.prefix) - Number(left.prefix) || right.score - left.score || left.index - right.index)
  return ranked.map(match => match.item)
}
