/**
 * token 数的缩写显示（04 号板块的用量条、13 号板块的上下文面板共用）。
 *
 * 不缩写在两个地方没法看：「128432」既占地方又读不出量级，而用户真正要
 * 判断的是"这轮是不是爆了"。
 */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}