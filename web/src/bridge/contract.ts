/**
 * 契约的公共类型（`BridgeClient` 的载荷与筛选条件）。
 *
 * 从 `client.ts` 拆出来的原因：那文件除了这个接口还有两百行类型定义，
 * 两者混在一起时，改终端方法要翻过设置中心的载荷定义。
 *
 * `client.ts` 会把这些类型再转发一次（`export type { ... } from './contract'`），
 * 所以调用方仍然只从 `client` 导入，导入路径不用改。
 */
import type {
  AgentEvent,
  ConnectInfo,
  FileChange,
  ReviewMode,
  Thread,
  ThreadSummary,
  ToolKind,
  ToolStatus,
  TurnId,
  UserInput,
} from './types'

// 工作区类型独立成文件（contract/workspaces.ts），避免这份契约超 200 行。
export {
  type WorkspacePick,
  type WorkspaceRemoved,
  type WorkspaceSummary,
  type WorkspacesPayload,
  type BatchDeleteResult,
} from './contract/workspaces'

// 模型类也用到的类型在这里转发一次，避免调用方在两个模块间来回 import。
export type { AgentEvent, ConnectInfo, Thread, ThreadSummary, TurnId, UserInput }

export type Unsubscribe = () => void

/** `resumeThread` 回放的历史条目：壳侧已从 Thread.turns 压缩成展示单元。 */
export type HistoryEntry =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'reasoning'; text: string }
  | {
      kind: 'tool'
      toolKind: ToolKind
      name: string
      status: ToolStatus
      output: string
      /** 协议 `commandExecution` / `mcpToolCall` 都带这两个；没有就是 null。 */
      exitCode?: number | null
      durationMs?: number | null
    }
  | { kind: 'fileEdit'; changes: FileChange[]; status: string }
  /**
   * 计划正文（协议 `plan` item 的 `text`）。
   *
   * 不进消息流，但要抬到 `turn.plan.draft` —— 见 `turnFromHistory`。
   */
  | { kind: 'plan'; text: string }
  // 以下与 Rust `map/history.rs`、`baselineMap.ts` 覆盖同一组 item 类型，
  // 保证「切会话（resume）」与「重连基线」看到的历史一致。
  | { kind: 'imageView'; path: string }
  | {
      kind: 'imageGeneration'
      status: string
      revisedPrompt?: string | null
      result?: string | null
      savedPath?: string | null
      failure?: unknown
    }
  | { kind: 'notice'; level: 'info' | 'warn' | 'danger'; text: string }
  | { kind: 'compaction'; byUser: boolean; summarizedCount: number | null }
  | { kind: 'subAgent'; agentThreadId: string; agentPath: string; activity: string }
  | { kind: 'reviewMode'; mode: ReviewMode; review: string }

export interface ThreadWithHistory extends Thread {
  history: HistoryEntry[]
}

/** 会话列表的筛选条件。 */
export interface ThreadFilter {
  cwd?: string
  archived?: boolean
  search?: string
}

export interface SendOutcome {
  kind: 'started' | 'steered' | 'queued'
  turnId?: string
  pending?: number
}

export interface ReviewTarget {
  type: 'uncommittedChanges' | 'baseBranch' | 'commit' | 'custom'
  branch?: string
  sha?: string
  title?: string | null
  instructions?: string
}

export interface PermissionProfile {
  id: string
  description?: string | null
  /** false 时前端应当置灰而不是隐藏——隐藏会让用户以为功能不存在。 */
  allowed: boolean
}

export interface SandboxReadiness {
  status: 'ready' | 'notConfigured' | 'updateRequired'
}

// ------------------------------------------------------- 文件系统（工作区约束）

/** 文件树里的一行。 */
export interface FsEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  hasChildren: boolean
}

export type FsReadResult =
  | { kind: 'text'; content: string; size: number }
  | { kind: 'image'; content: string; size: number }
  | { kind: 'binary'; size: number }
  | { kind: 'tooLarge'; size: number }

// --------------------------------------------------- 自定义模型配置

/** 模型提供商。codex 内置目录一概不用，全部由用户自定义。 */
export interface ProviderConfig {
  /** 发给 codex 的 provider id（非保留字：openai/ollama 等不可用）。 */
  id: string
  name: string
  /** 必须 http(s) 开头；留空会静默回落到内置端点，壳侧强制必填。 */
  baseUrl: string
  /** 存放 API Key 的环境变量名（推荐：不落盘）。 */
  envKey?: string
  /**
   * 直接填写的 Key：保存在本应用配置目录，仅本机使用。
   *
   * **壳不下发明文**（`bridge_settings_get` 把它置 null，见 settings_cmds.rs），
   * 所以读取时它总是空。回传约定（**没有"清除"语义**）：
   * - 填了新值 → 采用
   * - 空串或 null（local 模式留空 / 整表回传被抹）→ 保持原 Key
   * 要撤销 Key 目前需手改配置文件。
   */
  apiKey?: string
  /** 仅出现在读取响应里：本机确实存过 Key（表单用它在占位符里说明）。 */
  hasApiKey?: boolean
  /**
   * Responses API 请求路径（追加在 base_url 后）。需要 patched codex
   * （本仓库 codex-rs 已支持 `responses_path` 键）。
   *
   * - `null` / 缺省 → codex 默认 `/responses`
   * - `""`（空串）→ 直接 POST base_url：火山 Agent Plan（`/api/plan/v3`）
   *   这类「路径即端点」的网关必须用它，否则 codex 拼出 `/v3/responses` 404
   */
  responsesPath?: string | null
}

export interface ModelConfig {
  /** 发给 API 的模型 id。 */
  id: string
  displayName: string
  providerId: string
  /** 推理档位：自由字符串（low/medium/high…），留空用服务端默认。 */
  reasoningEffort?: string
  /** 上下文窗口（token），驱动界面的余量条。 */
  contextWindow?: number
  isDefault: boolean
}

export interface SettingsData {
  version: number
  providers: ProviderConfig[]
  models: ModelConfig[]
  activeModelId: string | null
  /** 通用 UI 偏好（settings.json 的 ui 段）。 */
  ui: UiPrefs
  /** 网页搜索工具开关（`tools.web_search`，默认关：由模型服务端实现）。 */
  webSearch: boolean
}

/**
 * 通用偏好。落在 settings.json 的 `ui` 段，与模型配置同一个文件——
 * 都是「跟着账号走、改了不用重启」的那一类。
 */
export interface UiPrefs {
  /** `light` / `dark` / `system`。 */
  theme: 'light' | 'dark' | 'system'
  /** 正文档位 10–22。只影响正文，不动 UI 控件字号。 */
  contentSize: number
  density: 'comfortable' | 'compact'
  /** true = Enter 发送、Shift+Enter 换行。 */
  enterSends: boolean
  /** 新会话的默认权限档位 id。 */
  defaultPermissionProfile: string | null
}

/**
 * `ui-state.json` 的形状。刻意用松散类型：文件由前端写、后端原样存，
 * 新板块加字段时后端不用跟着改（见 settings/ui_state.rs）。
 */
export interface UiStateRecord {
  layout?: {
    sidebar?: number
    rightbar?: number
    /** 左栏是否折叠成 56px rail。 */
    sidebarCollapsed?: boolean
    /** 右栏是否占位。 */
    rightOpen?: boolean
    mainView?: MainViewName
  }
  /** 每会话的右栏布局：`{ [threadId]: { ... } }`，见 docs/10。 */
  dock?: Record<string, unknown>
  /**
   * 会话恢复：重开应用后回到上次打开的会话（见 store/sessionRestore.ts）。
   *
   * 按工作区分桶（`lastThreadByCwd[cwd] = threadId`）：一个工作区只显示自己的
   * 会话，把 A 目录的会话恢复到 B 目录会指到一个根本不在列表里的线程。
   */
  session?: {
    lastThreadByCwd?: Record<string, string>
  }
  [key: string]: unknown
}

export type MainViewName = 'chat' | 'trajectory'

export interface SettingsPayload {
  settings: SettingsData
  /** settings.json 的落盘位置。 */
  configPath: string
  /** ui-state.json 的落盘位置（布局与右栏状态）。 */
  uiStatePath: string
}

export interface McpServerSummary {
  name: string
  runtimeStatus?: string | null
  authStatus: string
  toolCount: number
}

// ------------------------------------------------- 子 Agent（AF 规范）

/** 成员接入方式。 */
export type SubAgentKind = 'external' | 'codex'

/**
 * 登记/更新时提交的成员规格。
 *
 * `codex` 成员没有 exe：能力面（model/skills/mcpServers/prompt）经
 * `-c agents.<name>.*` 随下一次连接写进 codex 配置；`external` 成员必须
 * 给出已构建的可执行文件路径。
 */
export interface SubAgentSpec {
  name: string
  kind: SubAgentKind
  path?: string | null
  desc?: string | null
  team?: string | null
  model?: string | null
  skills?: string[] | null
  mcpServers?: string[] | null
  prompt?: string | null
}

/**
 * 已登记的子 agent。地址只存在注册表 `~/.agent-registry/registry.json`，
 * 这里是它在本机的实际状态——登记过但没构建是最常见的坑，直接标出来。
 */
export interface SubAgentRow {
  name: string
  kind: SubAgentKind
  path: string
  desc: string
  team?: string | null
  model?: string | null
  skills?: string[] | null
  mcpServers?: string[] | null
  prompt?: string | null
  registeredAt: number
  exeExists: boolean
  projectRoot?: string | null
  capabilityManifest?: string | null
  skillDoc?: string | null
  /** 副本来源的原始成员名；null/缺省 = 原初成员。 */
  derivedFrom?: string | null
  /** 原初成员在副本生成之后被改过——副本可能已过期，建议重跑特化。 */
  derivedStale?: boolean
}

/**
 * 团队：**不是成员**，而是成员之上的编组。成员用 `team` 字段归队；团队自己
 * 带一段**工作流 / SOP**，随派单说明注入会话，让主 agent 按流水线调度。
 */
export interface TeamRow {
  name: string
  /** 工作流 / SOP（自由文本；空串 = 未写）。 */
  workflow: string
  /** 团队规范：全体成员共同遵守的硬约束（空串 = 未写）。 */
  spec: string
  /** 团队花名册：挑选进来的原初成员名（副本随特化生成）。 */
  roster: string[]
  /** 归入该团队的成员名（含副本）。 */
  members: string[]
}

// 工作区类型已移到 contract/workspaces.ts。

/** codex 配置里的一个 MCP 服务器定义（`config/read` 的 mcp_servers 表）。 */
export interface McpDefinitionRow {
  id: string
  /** `stdio`（command/args）或 `http`（url）。 */
  kind: 'stdio' | 'http' | 'unknown'
  command?: string | null
  args?: string[] | null
  url?: string | null
  /** 服务端原始定义，编辑时按字段展开。 */
  raw?: unknown
}
