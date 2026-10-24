/**
 * 基础领域类型：线程、回合、用户输入、工具与回合的枚举。
 *
 * 与 `crates/codex-bridge` 对应。字段名与 Rust 侧的 serde 输出一致。
 */

/** 线程 / 回合 / 条目的标识。 */
export type ThreadId = string
export type TurnId = string
export type ItemId = string

// ---------------------------------------------------------------- 线程 / 回合

export interface Thread {
  id: ThreadId
  path?: string
  model?: string
  createdAt?: number
  updatedAt?: number
  preview?: string
  status?: ThreadStatusPayload
}

/**
 * 会话状态（协议 `ThreadStatus`，03 号文件的状态点数据源）。
 *
 * `notLoaded` / `idle` / `systemError` / `active`。**只有 `active` 带
 * `activeFlags`**——它是"正在跑但具体在干什么"的细目（执行命令 / 等审批 /
 * 正在 compact…），状态点 tooltip 用。
 */
export type ThreadStatusKind = 'notLoaded' | 'idle' | 'systemError' | 'active'

export interface ThreadStatusPayload {
  type: ThreadStatusKind
  activeFlags?: string[]
}

export interface ThreadSummary {
  id: ThreadId
  model?: string
  preview?: string
  updatedAt?: number
  /**
   * 运行态。桥接层映射 `thread/list` 里的 status；`thread/status/changed`
   * 通知会就地更新它——所以列表上的状态点是实时的，不用重新拉列表。
   */
  status?: ThreadStatusPayload
  /** 置顶（settings.json 的 `pinnedThreads`）。 */
  pinned?: boolean
}

export interface Turn {
  id: TurnId
  status?: string
  error?: unknown
  startedAt?: number
  completedAt?: number
  durationMs?: number
}

// --------------------------------------------------------------- 用户输入

/**
 * `turn/start` 的 `input` 元素（协议 `UserInput`）。
 *
 * # `text_elements` 是 snake_case，这是线格式本身
 *
 * `text` 的那个 `text_elements` 字段在协议里就叫这个名字（生成产物确认过），
 * 不是 camelCase。写成 `textElements` 的话 codex 认不出来——它会当成未知
 * 字段忽略，而**不会报错**，表现为"标注功能莫名其妙不生效"。
 * 其余字段（`isOther` 等）确实是 camelCase，别一起改。
 *
 * # `localImage` 带本地路径
 *
 * 图片不需要先 `thread/attachment/add`：`localImage.path` 直接给绝对
 * 路径，codex 自己读（见 docs/17 §5.8）。
 */
export type UserInput =
  | { type: 'text'; text: string; text_elements?: unknown[] }
  | { type: 'localImage'; path: string; detail?: string }
  | { type: 'image'; url?: string; fileId?: string; detail?: string }
  | { type: 'mention'; name: string; path: string }
  | { type: 'skill'; name: string; path: string }

// --------------------------------------------------------------- 枚举

export type ToolKind = 'command' | 'mcp' | 'webSearch' | 'dynamicTool' | 'collabAgent' | 'other'

export type ToolStatus = 'inProgress' | 'completed' | 'failed' | 'declined' | 'unknown'

export type TurnStatus = 'inProgress' | 'completed' | 'interrupted' | 'failed'

export type ApprovalKind =
  | 'commandExecution'
  | 'fileChange'
  | 'permissions'
  | 'userInput'
  | 'elicitation'
  | 'other'

export type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel'

export type ReviewMode = 'entered' | 'exited'

/** 文件变更的增删改。 */
export type FileChange =
  | { kind: 'add'; path: string; diff: string }
  | { kind: 'delete'; path: string; diff: string }
  | { kind: 'update'; path: string; diff: string; movePath?: string }

// --------------------------------------------------------------- 计划

export interface PlanStep {
  step: string
  status: string
}

/** 计划步骤的状态由服务端定义，这里只做展示映射。 */
export type PlanStepState = 'pending' | 'inProgress' | 'completed' | 'blocked'

// ------------------------------------------------------------------ 连接

export type ConnectionState = 'disconnected' | 'connecting' | 'ready' | 'error'

export interface ConnectInfo {
  userAgent: string
  codexHome: string
  platformFamily?: string
  platformOs?: string
  /** 用户主目录，作为默认工作目录（壳侧提供）。 */
  homeDir?: string
}

/**
 * 目标状态（`ThreadGoalStatus`，07 号文件）。
 *
 * 枚举值原样透传：壳里不归并成"进行中/结束"两档——那样会在上游加枚举时
 * 静默丢掉新状态，而"额度用尽"和"受阻"对用户是完全不同的两件事。
 *
 * `paused` 是**枚举的一个取值**，不是布尔字段（docs/17 §5.3）。
 */
export type GoalStatus =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'usageLimited'
  | 'budgetLimited'
  | 'complete'

/**
 * 目标对象。字段全部可选且可为 null——协议没承诺哪些字段一定在，
 * 所以这里不假设任何一个必有（`ThreadGoalSetParams` 的 null 语义是"不动它"）。
 */
export interface Goal {
  objective?: string | null
  status?: GoalStatus | null
  tokenBudget?: number | null
  elapsedMs?: number | null
  tokenUsage?: number | null
}

export interface HookPromptFragment {
  text: string
  hookRunId: string
}

/**
 * `item/tool/requestUserInput` 里的一道题（12 号文件）。
 *
 * 放 core.ts 而不是 events.ts：它既是事件载荷，也是卡片要渲染的数据，
 * 两边都要用。
 */
export interface UserInputQuestion {
  id: string
  /** 短标题，用于卡片分组。 */
  header: string
  question: string
  /** 是否允许"其他"自由填写。 */
  isOther: boolean
  /** 答案要不要打码（密码类）。 */
  isSecret: boolean
  /** null = 纯填空题；有值就是选择题。 */
  options: UserInputOption[] | null
}

export interface UserInputOption {
  id: string
  label: string
  description?: string | null
}
