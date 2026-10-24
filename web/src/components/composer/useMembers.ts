import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SubAgentRow } from '../../bridge/client'
import { getClient } from '../../bridge/session'
import type { MemberCandidate } from './TriggerManager'

/** 主进程 registry::watch 广播的事件名（src-tauri registry/watch.rs）。 */
const REGISTRY_EVENT = 'registry-changed'

/**
 * 人员清单：注册表里的**原初成员**（副本是团队成员，不算"人"）。
 *
 * `/per` 弹层用它——选中一个人 = 在消息里点名"用 TA 的能力"。与
 * `useTeamNames` 走同一条刷新链路：codex 改注册表后几秒内自动更新。
 */
export function useMembers(): MemberCandidate[] {
  const [rows, setRows] = useState<SubAgentRow[]>([])

  const reload = useCallback(() => {
    void getClient()
      .listSubAgents()
      .then(setRows)
      .catch(() => setRows([]))
  }, [])

  useEffect(() => {
    reload()
    // 动态 import 的 cancelled/unlisten 形状抄 useTeamNames（退订来得比
    // 监听早/晚两种时序都兜住）。
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

  return useMemo(
    () =>
      rows
        .filter((row) => !row.derivedFrom)
        .map((row) => ({
          name: row.name,
          // 提示用职责：用户是按"谁能干什么"挑人，不是按名字挑。
          hint: row.desc?.trim() || row.skills?.join(' / ') || '未写职责',
        })),
    [rows],
  )
}
