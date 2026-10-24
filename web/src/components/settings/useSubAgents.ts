import { useCallback, useEffect, useState } from 'react'
import type { SubAgentRow, SubAgentSpec, TeamRow } from '../../bridge/client'
import { getClient } from '../../bridge/session'
import { describe } from './useModelSettings'

export interface SubAgentsState {
  rows: SubAgentRow[]
  /** 团队（成员之上的编组）与各自的工作流 / SOP。 */
  teams: TeamRow[]
  /** 注入会话的派单说明全文（预览用）。 */
  instructions: string | null
  errors: string[]
  reload: () => Promise<void>
  remove: (name: string) => Promise<void>
  register: (spec: SubAgentSpec) => Promise<void>
  update: (spec: SubAgentSpec) => Promise<void>
  setWorkflow: (team: string, workflow: string) => Promise<void>
}

/**
 * 子 Agent（AF 规范注册表）的状态，**独有功能**（00 铁律 3）。
 *
 * 注册表本体在 `~/.agent-registry/registry.json`，`registry.rs` 不动；
 * 这里只是把它包成界面能用的形状。
 *
 * 生效时机分两种：**外部进程**成员改完即生效（派单说明在
 * thread/start / thread/resume 时才注入）；**codex 原生**成员的能力面
 * 经 `-c agents.*` 随下一次连接注入，改完要点一次重连。
 */
export function useSubAgents(): SubAgentsState {
  const [rows, setRows] = useState<SubAgentRow[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [instructions, setInstructions] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const reload = useCallback(async () => {
    try {
      const [list, teamList, text] = await Promise.all([
        getClient().listSubAgents(),
        getClient().listTeams(),
        getClient().subAgentInstructions(),
      ])
      setRows(list)
      setTeams(teamList)
      setInstructions(text)
      setErrors([])
    } catch (err) {
      setErrors([`读取子 Agent 失败：${describe(err)}`])
    }
  }, [])

  // 挂载就读一次。设置中心有五个域，但这个域的数据量很小（注册表就一个文件），
  // 不值得为它做按需加载。
  useEffect(() => {
    void reload()
  }, [reload])

  const remove = useCallback(
    async (name: string) => {
      try {
        await getClient().removeSubAgent(name)
        await reload()
      } catch (err) {
        setErrors([describe(err)])
      }
    },
    [reload],
  )

  const register = useCallback(
    async (spec: SubAgentSpec) => {
      await getClient().registerSubAgent(spec)
      await reload()
    },
    [reload],
  )

  const update = useCallback(
    async (spec: SubAgentSpec) => {
      await getClient().updateSubAgent(spec)
      await reload()
    },
    [reload],
  )

  const setWorkflow = useCallback(
    async (team: string, workflow: string) => {
      try {
        await getClient().setTeamWorkflow(team, workflow)
        await reload()
      } catch (err) {
        setErrors([describe(err)])
      }
    },
    [reload],
  )

  return { rows, teams, instructions, errors, reload, remove, register, update, setWorkflow }
}
