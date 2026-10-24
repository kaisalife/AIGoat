import { useCallback, useEffect, useState } from 'react'
import type { TeamRow } from '../../bridge/client'
import { getClient } from '../../bridge/session'

/** 主进程 registry::watch 广播的事件名（src-tauri registry/watch.rs）。 */
const REGISTRY_EVENT = 'registry-changed'

/**
 * 注册表里的团队清单：`@` 弹层「团队」分组的数据源。
 *
 * 不复用 useSubAgents：它还拉成员行与派单说明，composer 只需要团队名。
 * codex 经 CLI（team-apply）改注册表后 registry-changed 到达即重拉——
 * 与 TeamTab 同一条刷新链路，弹层候选自动跟上，不必重开会话。
 */
export function useTeamNames(): TeamRow[] {
  const [teams, setTeams] = useState<TeamRow[]>([])

  const reload = useCallback(() => {
    void getClient()
      .listTeams()
      .then(setTeams)
      .catch(() => setTeams([]))
  }, [])

  useEffect(() => {
    reload()
    // 动态 import 的 cancelled/unlisten 形状抄 TeamTab（退订来得比监听
    // 早/晚两种时序都兜住）。
    let cancelled = false
    let unlisten: (() => void) | null = null
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const stop = await listen(REGISTRY_EVENT, () => reload())
      if (cancelled) {
        void stop()
        return
      }
      unlisten = stop
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [reload])

  return teams
}
