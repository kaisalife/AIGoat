/** 资源域的桥接实现：MCP/技能/钩子/config、子 Agent 注册表、工作区。 */

import { call } from './tauriCall'
import type {
  McpServerSummary,
  SubAgentRow,
  SubAgentSpec,
  TeamRow,
  WorkspacePick,
  WorkspaceRemoved,
  WorkspacesPayload,
} from './client'

type SkillEntry = { cwd: string; skills: { name: string; description: string }[] }
type HookEntry = { key: string; eventName: string; handlerType: string; enabled: boolean }

/** 该域的实现集合。由 `tauri.ts` 展开成同一个 client 对象。 */
export function resourcesApi() {
  return {
    // ------------------------------------------ 右栏的资源数据源
    mcpServers() {
      return call<McpServerSummary[]>('bridge_mcp_servers')
    },
    async skills(cwd: string) {
      const entries = await call<SkillEntry[]>('bridge_skills', { cwd })
      // 壳按 cwd 分组回；界面只关心当前工作区的技能，所以压平。
      return entries.flatMap((e) => e.skills)
    },
    hooks(cwd: string) {
      return call<HookEntry[]>('bridge_hooks', { cwd })
    },
    async mcpDefinitions() {
      return call<import('./contract').McpDefinitionRow[]>('bridge_mcp_definitions_read')
    },
    async mcpDefinitionWrite(id: string, definition: Record<string, unknown>) {
      await call<unknown>('bridge_mcp_definition_write', { id, definition })
    },
    async mcpDefinitionRemove(id: string) {
      await call<unknown>('bridge_mcp_definition_remove', { id })
    },
    async skillsConfigWrite(name: string, enabled: boolean) {
      await call<{ effectiveEnabled: boolean }>('bridge_skills_config_write', { name, enabled })
    },
    async skillsConfigRead() {
      return call<unknown>('bridge_skills_config_read')
    },
    async skillsRootsSet(roots: string[]) {
      await call<unknown>('bridge_skills_roots_set', { extraRoots: roots })
    },
    async config(cwd?: string) {
      // 命令只回键名（配置里可能有凭据），这里补成对象。
      const keys = await call<string[]>('bridge_config', { cwd })
      return keys.map((key) => ({ key, value: null }))
    },

    // ------------------------------------------- 子 Agent（AF 规范）
    listSubAgents() {
      return call<SubAgentRow[]>('bridge_subagents_list')
    },
    async registerSubAgent(spec: SubAgentSpec) {
      await call<void>('bridge_subagents_register', { name: spec.name, spec })
    },
    async updateSubAgent(spec: SubAgentSpec) {
      await call<void>('bridge_subagents_update', { name: spec.name, spec })
    },
    async removeSubAgent(name: string) {
      await call<void>('bridge_subagents_remove', { name })
    },
    async subAgentInstructions() {
      const resp = await call<{ instructions: string | null }>(
        'bridge_subagents_instructions',
      )
      return resp.instructions
    },
    listTeams() {
      return call<TeamRow[]>('bridge_teams_list')
    },
    async setTeamWorkflow(team: string, workflow: string) {
      const resp = await call<{ teams: TeamRow[] }>('bridge_teams_set_workflow', {
        team,
        workflow,
      })
      return resp.teams
    },

    // -------------------------------------------------------- 工作区
    listWorkspaces() {
      return call<WorkspacesPayload>('bridge_workspaces_list')
    },
    pickWorkspace() {
      return call<WorkspacePick>('bridge_workspaces_pick')
    },
    activateWorkspace(path: string) {
      return call<WorkspacesPayload>('bridge_workspaces_activate', { path })
    },
    removeWorkspace(path: string, deleteSessions: boolean) {
      return call<WorkspaceRemoved>('bridge_workspaces_remove', { path, deleteSessions })
    },
    async revealWorkspace(path: string) {
      await call<void>('bridge_workspaces_reveal', { path })
    },
  }
}