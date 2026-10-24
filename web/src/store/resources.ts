/**
 * 检查器（右栏）的数据。
 *
 * 与 `shell.tsx` 分开：那边是「对话在发生什么」，这边是「环境是什么样」。
 * 两者刷新节奏不同——会话数据随事件流变，资源数据只在切换项目或
 * 手动刷新时变，混在一个 store 里会让右栏跟着每条事件重渲染。
 *
 * 两个 store 共用 `bridge/session` 里的那一条连接：各建一份会得到两个
 * app-server 进程、两套事件流，状态永远对不上。
 */

import { create } from 'zustand'
import type { McpServerSummary, PermissionProfile, SandboxReadiness } from '../bridge/client'
import { getClient } from '../bridge/session'

export interface SkillInfo {
  name: string
  description: string
}

export interface HookInfo {
  key: string
  eventName: string
  handlerType: string
  enabled: boolean
}

interface ResourceState {
  loading: boolean
  error: string | null
  permissions: PermissionProfile[]
  sandbox: SandboxReadiness | null
  mcpServers: McpServerSummary[]
  skills: SkillInfo[]
  hooks: HookInfo[]
  /** 上次因事件自动刷新的时刻，防抖用。 */
  lastEventRefresh: number

  load: (cwd: string) => Promise<void>
  /** 沙箱或 MCP 状态变化后单独刷新，不动其它面板。 */
  refreshSandbox: () => Promise<void>
  refreshMcp: () => Promise<void>
  refreshSkills: () => Promise<void>
  /**
   * 事件驱动的自动刷新（16 号板块 §3「resources 事件驱动改造」）。
   *
   * C 期已经把真源映射成 `hostEvent` 了（`mcpProgress` / `skillsChanged` /
   * `projectChanged` / guard 的沙箱类），之前只差一个消费者。现在有了：
   * MCP 服务器重启、技能目录变化，右栏自己就更新了，不必手点刷新。
   *
   * 带 800ms 防抖：一次 `mcpServer/*` 变更往往连着来好几条
   * （startupStatus + 若干 event/stream），逐条刷会把右栏闪成筛子。
   */
  ingestHostEvent: (kind: string) => void
}

export const useResources = create<ResourceState>()((set, get) => {
  const client = getClient()
  // 合并**同一类**资源的并发刷新：加载中再来一条同类事件时直接跳过。
  const inflight = new Set<string>()

  return {
    loading: false,
    error: null,
    permissions: [],
    sandbox: null,
    mcpServers: [],
    skills: [],
    hooks: [],
    lastEventRefresh: 0,

    async load(cwd) {
      // 登记当前工作区：事件驱动的 `refreshSkills` 手上没有工作区上下文，
      // 靠这里记下的 cwd 决定读哪个目录。之前没有任何地方写它，于是
      // skillsChanged/projectChanged 的自动刷新永远是空操作。
      bindResourceCwd(cwd)
      set({ loading: true, error: null })
      const [permissions, sandbox, mcpServers, skills, hooks] = await Promise.all([
        client.permissionProfiles(cwd).catch((err) => { console.error('[resources] permissionProfiles:', err); return [] as PermissionProfile[] }),
        client.sandboxReadiness().catch((err) => { console.error('[resources] sandboxReadiness:', err); return null }),
        client.mcpServers().catch((err) => { console.error('[resources] mcpServers:', err); return [] as McpServerSummary[] }),
        client.skills(cwd).catch((err) => { console.error('[resources] skills:', err); return [] as SkillInfo[] }),
        client.hooks(cwd).catch((err) => { console.error('[resources] hooks:', err); return [] as HookInfo[] }),
      ])
      set({ loading: false, permissions, sandbox, mcpServers, skills, hooks })
    },

    async refreshSandbox() {
      try {
        set({ sandbox: await client.sandboxReadiness(), error: null })
      } catch (err) {
        set({ error: describe(err) })
      }
    },

    async refreshMcp() {
      try {
        set({ mcpServers: await client.mcpServers(), error: null })
      } catch (err) {
        set({ error: describe(err) })
      }
    },

    async refreshSkills() {
      // 资源是**工作区级**的，所以要记 cwd——事件驱动的自动刷新发生时，
      // 调用方手上不一定有工作区上下文（可能是另一个线程触发的事件）。
      const cwd = resourceCwd
      if (!cwd) return
      try {
        const [skills, hooks] = await Promise.all([
          client.skills(cwd).catch((err) => { console.error('[resources] skills:', err); return [] as SkillInfo[] }),
          client.hooks(cwd).catch((err) => { console.error('[resources] hooks:', err); return [] as HookInfo[] }),
        ])
        set({ skills, hooks, error: null })
      } catch (err) {
        set({ error: describe(err) })
      }
    },

    ingestHostEvent(kind) {
      const plan = REFRESH_PLAN[kind]
      if (!plan) return
      if (inflight.has(plan)) return
      inflight.add(plan)
      void Promise.all(
        plan === 'mcp'
          ? [get().refreshMcp()]
          : plan === 'sandbox'
            ? [get().refreshSandbox()]
            : [get().refreshSkills()],
      ).finally(() => {
        inflight.delete(plan)
        set({ lastEventRefresh: Date.now() })
      })
    },
  }
})

/**
 * 资源所属的工作区。
 *
 * 存在模块级而不是 store 里：它只在 `load` 时被写入、从不需要被界面读到，
// 而放进 store 会让「谁写的、什么时候写的」变得需要追踪。
 */
let resourceCwd: string | null = null

/** 供 `load` 登记工作区；事件驱动的刷新靠它决定读哪个目录。 */
export function bindResourceCwd(cwd: string): void {
  resourceCwd = cwd || null
}

/**
 * `hostEvent` / `guardEvent` 的 kind → 该刷哪一块。
 *
 * 只列真正意味着「数据变了」的 kind：`output` / `fsChanged` 这类高频流
 * 不列——它们不改变右栏任何一块的内容，刷了纯浪费。
 */
const REFRESH_PLAN: Record<string, 'mcp' | 'sandbox' | 'skills' | undefined> = {
  // MCP：连接状态、OAuth 结果、事件流
  mcpProgress: 'mcp',
  // 技能与项目：目录变了
  skillsChanged: 'skills',
  projectChanged: 'skills',
  // 沙箱：就绪 / 需更新 / 目录可写性
  sandboxSetupCompleted: 'sandbox',
  worldWritableWarning: 'sandbox',
  authRecovery: 'mcp',
}

/**
 * 沙箱三态的中文标签。
 *
 * `updateRequired` 刻意单列：它和「没装」修法完全不同，合并显示会让用户
 * 以为「重装一下」能解决，而实际需要的是更新。
 */
export function sandboxLabel(status: SandboxReadiness['status'] | undefined): string {
  switch (status) {
    case 'ready':
      return '就绪'
    case 'notConfigured':
      return '未配置'
    case 'updateRequired':
      return '需更新'
    default:
      return '未知'
  }
}

export function sandboxTone(
  status: SandboxReadiness['status'] | undefined,
): 'ok' | 'warn' | 'danger' | undefined {
  switch (status) {
    case 'ready':
      return 'ok'
    case 'notConfigured':
      return 'warn'
    // 过期比没装更隐蔽，用 danger 提一级注意力
    case 'updateRequired':
      return 'danger'
    default:
      return undefined
  }
}

export function sandboxHint(status: SandboxReadiness['status'] | undefined): string | undefined {
  switch (status) {
    case 'ready':
      return '沙箱已就绪，命令在隔离环境里执行'
    case 'notConfigured':
      return '沙箱未配置，命令可能不受隔离'
    case 'updateRequired':
      return '沙箱组件版本过期，需要更新后才能继续隔离'
    default:
      return undefined
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}