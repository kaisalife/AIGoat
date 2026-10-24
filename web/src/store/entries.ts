/**
 * 消息流的条目类型。
 *
 * 「条目」是渲染单位；与协议 event 不是一一对应（见 `reducer/`）。
 * 条目永远是**扁平**的：父子关系不进这一层（工具调用的嵌套记在
 * `childOf` 字段里），归组与建树由 `grouping.ts` 在渲染边界一次算完。
 * 这样 reducer 只管「事件怎么变成条目」，不必同时管「怎么排版」。
 */

import type { FileChange, ReviewMode, ToolKind, ToolStatus } from '../bridge/types'
import type { Base } from './entryBase'
import type {
  ElicitationEntry,
  FunctionOutputEntry,
  ToolCallEntry,
  UserInputEntry,
} from './hostEntries'

export type { ElicitationEntry, FunctionOutputEntry, ToolCallEntry, UserInputEntry }
export type { Base }

/** 归组用的「过程类」条目种类。 */
export type ProcessKind = 'reasoning' | 'tool' | 'fileEdit'

export interface UserEntry extends Base {
  kind: 'user'
  text: string
  /**
   * 本地回显的待确认消息（04 §3.2）。
   *
   * 发送即显示，不等服务端；权威 `userMessage` 到达后按 `clientMsgId`
   * 原子替换并**保留原时间戳**——否则用户会看到自己的消息"跳"到下面去，
   * 断线重连时更会以为消息丢了。
   */
  pending?: boolean
  clientMsgId?: string
}

export interface AssistantEntry extends Base {
  kind: 'assistant'
  text: string
  /** 还在流式输出中：光标要闪，且不允许折叠。 */
  streaming: boolean
}

export interface ReasoningEntry extends Base {
  kind: 'reasoning'
  text: string
  streaming: boolean
  /** 该段来自 `summaryTextDelta`（标题级摘要）而非正文（04 §1）。 */
  isSummary?: boolean
}

export interface ToolEntry extends Base {
  kind: 'tool'
  itemId: string
  toolKind: ToolKind
  name: string
  input?: unknown
  /**
   * 累积的流式输出。
   *
   * 声明成 string，但**协议给的 `dynamicToolCall` 完成事件带的是
   * `contentItems` 数组**（`{type,text|imageUrl|audioUrl}[]`），壳侧原样透传，
   * 所以动态工具卡这里运行时确实是数组。
   *
   * 不改成联合类型是有原因的：所有渲染都走 `JsonBody` 的
   * `pretty(value: unknown)`（字符串直出、其余 `JSON.stringify`），改成
   * `string | unknown[]` 会让每个消费点都得先判一次形态，而判了也还是走同一条
   * 渲染路径。保持 `string` 是**这里唯一需要知道真相的地方**，故注释在此声明。
   */
  output: string
  /**
   * MCP 的进度文案（05 号板块 §3.2 的进度条数据源）。
   *
   * 与 `output` 分开：进度是"正在做什么"的人话，混进输出会让最终结果
   * 被一串 "Fetching schema…" 污染。
   */
  progress?: string
  status: ToolStatus
  exitCode?: number | null
  durationMs?: number | null
  error?: string | null
  streaming: boolean
  /** 父工具调用 id。子 agent 内部再调工具时挂上去（05 §3.2）。 */
  childOf?: string | null
}

export interface ApprovalEntry extends Base {
  kind: 'approval'
  itemId: string
  requestId: unknown
  approvalKind: string
  command?: string | null
  cwd?: string | null
  reason?: string | null
  state: 'pending' | 'approved' | 'declined'
  decision?: string
}

export interface FileEditEntry extends Base {
  kind: 'fileEdit'
  itemId: string
  changes: FileChange[]
  status: string
}

export interface NoticeEntry extends Base {
  kind: 'notice'
  level: 'info' | 'warn' | 'danger'
  text: string
}

/**
 * 上下文压缩（13 号）：不可逆，所以出独立的卡 + 常驻提示条。
 */
export interface CompactionEntry extends Base {
  kind: 'compaction'
  /** 进行中（已发起 /compact 但还没收到 compacted）。 */
  running: boolean
  /** true = 用户手动触发；false = codex 自动压缩。 */
  byUser: boolean
  /** 被摘要的更早消息条数；协议没给就是 null（卡片不显示数字）。 */
  summarizedCount?: number | null
}

/**
 * 压缩的常驻提示条（13 号板块 §3.2）。
 *
 * 为什么卡之外还要一条：卡在消息流里，**滚上去就看不见了**。而压缩是
 * 不可逆的信息损失——用户几轮之后才发现"它怎么不记得我说的那个文件"，
 * 代价已经造成了。提示条常驻在输入区上方，只要影响还在就在。
 *
 * `dismissed` 存在条目上而不是组件 state：换会话回来时它还在，
 * 状态跟着消息流走而不是跟着组件生命周期走。
 */
export interface CompactionNoticeEntry extends Base {
  kind: 'compactionNotice'
  byUser: boolean
  summarizedCount: number | null
  /** 用户点了「知道了」。 */
  dismissed: boolean
}

export interface DividerEntry extends Base {
  kind: 'divider'
  label: string
}

/** 子 Agent 活动。多 Agent 协作靠它串联，点击可跳到子 Agent 的线程。 */
export interface SubAgentEntry extends Base {
  kind: 'subAgent'
  agentThreadId: string
  agentPath: string
  activity: string
}

/** 进入 / 退出复核模式，作为消息流里的分隔标记。 */
export interface ReviewModeEntry extends Base {
  kind: 'reviewMode'
  mode: ReviewMode
  review: string
}

/** 回合内 diff 流（`turn/diff/updated`）。 */
export interface DiffEntry extends Base {
  kind: 'diff'
  diff: string
}


/**
 * `imageView`：模型在会话里显示了一张本地图（11 号板块 §3.3）。
 *
 * 协议给的是**本地路径**，不是 base64 —— 所以渲染时要读一次。
 */
export interface ImageViewEntry extends Base {
  kind: 'imageView'
  path: string
}

/**
 * `imageGeneration`：图片生成的结果。
 *
 * `result` 与 `savedPath` 至少有一个非空：前者是协议给的产物引用，
 * 后者是落盘后的绝对路径。
 */
export interface ImageGenerationEntry extends Base {
  kind: 'imageGeneration'
  status: string
  revisedPrompt?: string | null
  result?: string | null
  savedPath?: string | null
  failure?: unknown
}

export type ProcessEntry = ReasoningEntry | ToolEntry | FileEditEntry

export type Entry =
  | UserEntry
  | AssistantEntry
  | ReasoningEntry
  | ToolEntry
  | ToolCallEntry
  | ApprovalEntry
  | UserInputEntry
  | ElicitationEntry
  | FileEditEntry
  | NoticeEntry
  | CompactionEntry
  | CompactionNoticeEntry
  | DividerEntry
  | SubAgentEntry
  | ReviewModeEntry
  | DiffEntry
  | ImageViewEntry
  | ImageGenerationEntry
  | FunctionOutputEntry

/** 提问类条目：都要用户作答，未答完输入区必须禁用。 */
export type QuestionEntry = UserInputEntry | ElicitationEntry

export function isQuestionEntry(entry: Entry): entry is QuestionEntry {
  return entry.kind === 'userInput' || entry.kind === 'elicitation'
}

/**
 * 是不是「过程」条目。
 *
 * 连续的多个过程条目会被 `grouping.ts` 并成一个可折叠的过程组。
 * 单个的不并——给一条工具调用套一层折叠壳只是多点一次。
 */
export function isProcessEntry(entry: Entry): entry is ProcessEntry {
  return entry.kind === 'reasoning' || entry.kind === 'tool' || entry.kind === 'fileEdit'
}