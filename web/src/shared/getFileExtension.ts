/**
 * 从路径中提取文件扩展名（小写，不含点）。
 *
 * 用于图片类型判断、MIME 类型映射等场景。
 * 没有扩展名或提取失败时返回空字符串。
 */

export function getFileExtension(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  return ext ?? ''
}
