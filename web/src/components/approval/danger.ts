/**
 * 危险命令的显式确认（12 号板块 §3.1 的 RiskConfirmation）。
 *
 * # 为什么需要它
 *
 * 审批默认是"Enter 批准"。这对 `npm test` 没问题，对 `rm -rf` 就很危险——
 * 用户在审批框里按下 Enter 的肌肉动作，和在确认"真的要删"时按 Enter
 * 的心理准备，是两件事。
 *
 * 所以**危险命令必须用 `Shift+Enter`** 才批准：多一个modifier的成本，
 * 换来"误手一按删掉整个项目"的概率显著下降。
 *
 * # 判定有多保守
 *
 * 宁可误报（把安全命令也标成危险），不可漏报。漏报的代价是不可逆的数据损失，
 * 误报的代价是用户多按一个 Shift。
 */

/**
 * 会命中这些片段的命令视为危险。
 *
 * 匹配的是**子串**而不是整词：`rm -rf ~/foo`、`git reset --hard`、
 * `Remove-Item -Recurse`、`format c:` 都应该命中。宁可把
 * `echo "drop table" ` 这种无害命令也标出来。
 */
const DANGEROUS = [
  // 删除
  'rm ', 'rm -', 'del ', 'erase ', 'rmdir ', 'remove-item', 'unlink',
  // 覆盖与格式化
  'format ', 'mkfs', 'dd ', 'diskpart', 'cipher ', 'shred ',
  // Git 的破坏性操作
  'reset --hard', 'clean -', 'push --force', 'push -f', 'checkout .',
  // 权限与所有权
  'chmod 777', 'chown -r', 'takeown',
  // 数据库
  'drop table', 'drop database', 'truncate ',
  // 包管理器的全局操作
  'npm publish', 'cargo publish', 'pip uninstall', 'npm uninstall -g',
]

/** 管理员/提权。命中即危险——普通任务不需要它。 */
const PRIVILEGED = ['sudo ', 'runas ', 'administrator', 'start-process -verb runas']

/**
 * 这条命令要不要显式确认。
 *
 * 同时看命令文本与 cwd：`cd / && rm -rf *` 里的 `*` 不会命中关键词，
 * 但整条命令显然危险——所以额外规则是"含通配的删除"也算。
 */
export function isDangerousCommand(command: string | null | undefined, cwd?: string | null): boolean {
  const text = (command ?? '').toLowerCase().trim()
  if (!text) return false
  if (DANGEROUS.some((needle) => text.includes(needle))) return true
  if (PRIVILEGED.some((needle) => text.includes(needle))) return true
  // 通配删除：`rm *` / `del *.log` —— 关键词匹配抓不到，靠通配符补。
  if (/\b(rm|del|erase)\b[^\n]*\*|remove-item[^\n]*\*/.test(text)) return true
  // 在根目录 / 用户主目录上执行的任何删除
  if (/\b(rm|del|erase|remove-item)\b/.test(text) && isBroadTarget(cwd)) return true
  return false
}

/**
 * 工作目录是不是「一删就完」的那种。
 *
 * 只认两种：文件系统根、以及用户主目录。其它目录（项目子目录）
 * 即便被删也可重建，不值得加一步确认。
 */
function isBroadTarget(cwd: string | null | undefined): boolean {
  if (!cwd) return false
  const path = cwd.replace(/[\\/]+$/, '').toLowerCase()
  if (path === '' || path === '/' || path === 'c:' || path === 'c:\\') return true
  const home = /^[a-z]:\\users\\[^\\]+$/.test(path)
  return home
}

/** 危险命令的原因短语，tooltip 与按钮文案共用。 */
export function dangerReason(command: string | null | undefined): string {
  const text = (command ?? '').toLowerCase()
  if (PRIVILEGED.some((n) => text.includes(n))) return '涉及提权'
  if (/\b(rm|del|erase|remove-item)\b/.test(text)) return '删除操作'
  if (text.includes('format') || text.includes('mkfs') || text.includes('diskpart')) return '磁盘操作'
  if (text.includes('reset --hard') || text.includes('clean -')) return '丢弃改动'
  if (text.includes('push --force') || text.includes('push -f')) return '强制推送'
  return '不可逆操作'
}