/**
 * 卡片层的单一出口。
 *
 * 不做这个再导出的唯一理由：`cards/` 目录会同时有 CardShell、
 * summaries、若干张卡和一个 router，组件侧逐个 import 的话
 * "该用哪张卡"这件事就散到每个调用点了。
 */

export { CardShell, formatMs, toneOfStatus } from './CardShell'
export type { CardShellProps } from './CardShell'
export { ToolCardRouter, ToolEntryCard, TurnDiffCard } from './ToolCardRouter'
export { ClientToolCard } from './ClientToolCard'
export { ElicitationCard, UserInputCard } from './UserInputCard'
export { CommandCard } from './CommandCard'
export { FileChangeCard, McpToolCard, DynamicToolCard, JsonBody } from './ToolCards'
export {
  CollabAgentCard,
  FunctionOutputCard,
  HookPromptCard,
  SleepCard,
  SubAgentBadge,
  WebSearchCard,
} from './MinorCards'
export {
  fileEditSummary,
  groupSummary,
  kindLabel,
  primaryArg,
  statusLabel,
  toolSummary,
  truncate,
} from './summaries'