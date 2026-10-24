/**
 * 绝对路径 → 工作区相对路径（文件树「添加到对话」用）。
 *
 * Windows 路径大小写不敏感，前缀比较按小写做、输出保留原样；
 * 不在工作区内的路径原样返回（绝对路径总比截断错的相对路径好）。
 */
export function relativeToWorkspace(
  root: string | null | undefined,
  path: string,
): string {
  if (!root) return path
  const norm = (value: string): string => value.replaceAll('\\', '/').replace(/\/+$/, '')
  const r = norm(root)
  const p = norm(path)
  if (p === r) return '.'
  if (p.toLowerCase().startsWith(`${r.toLowerCase()}/`)) {
    return p.slice(r.length + 1)
  }
  return path
}
