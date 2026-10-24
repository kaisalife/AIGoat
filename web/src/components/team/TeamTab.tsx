import { useEffect, useMemo, useState } from 'react'
import type { DockPanelProps } from '../dock/types'
import type { SubAgentRow } from '../../bridge/client'
import { Button } from '../primitives'
// 「子代理域」的宿主在 settings/（SubagentsDomain 同源）：数据与表单直接
// 复用，不迁移 hook——TeamTab 是同一份数据的第二个视图。
import { useSubAgents } from '../settings/useSubAgents'
import { SubAgentForm } from '../settings/SubAgentForm'
import { ErrorList } from '../settings/domains/shared'
import { TeamMemberCard } from './TeamMemberCard'
import { TeamWorkflowCard } from './TeamWorkflowCard'
import s from './TeamTab.module.css'

/** 主进程 registry::watch 广播的事件名（src-tauri registry/watch.rs）。 */
const REGISTRY_EVENT = 'registry-changed'

/**
 * 团队 tab：注册表的**可视化**视图（管理域在设置中心「子 Agent」）。
 *
 * 数据复用 useSubAgents；codex 经 CLI（team-apply）改注册表时，
 * registry::watch 的事件到达后 reload，卡片墙自动更新——这就是
 * 「提示词驱动」改动能被人工看见的关键链路。
 */
export function TeamTab(_props: DockPanelProps) {
  const { rows, teams, errors, reload, remove, register, update, setWorkflow, setSpec, materialize } =
    useSubAgents()
  const [form, setForm] = useState<{ mode: 'new' } | { mode: 'edit'; row: SubAgentRow } | null>(null)

  // 监听主进程的注册表变更。动态 import 的 cancelled/unlisten 形状抄
  // bridge/tauri.ts 的 subscribe（退订来得比监听早/晚两种时序都兜住）。
  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | null = null
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const stop = await listen(REGISTRY_EVENT, () => {
        void reload()
      })
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

  // 按 team 归组（未编队单独一组）；只写了 workflow、还没有成员的团队也要显示。
  const { grouped, extra } = useMemo(() => {
    const map = new Map<string, SubAgentRow[]>()
    for (const row of rows) {
      const key = row.team ?? ''
      const list = map.get(key)
      if (list) list.push(row)
      else map.set(key, [row])
    }
    const seen = new Set(map.keys())
    const extra = teams
      .filter((t) => !seen.has(t.name) && !!(t.workflow.trim() || t.spec.trim() || t.roster.length))
      .map((t) => t.name)
    return { grouped: [...map.entries()], extra }
  }, [rows, teams])

  // 每个团队的副本统计：总数 + 过期数（原初被改过）。
  const derivedOf = (team: string) => {
    const copies = rows.filter((r) => r.team === team && r.derivedFrom)
    return { total: copies.length, stale: copies.filter((r) => r.derivedStale).length }
  }

  const empty = rows.length === 0 && extra.length === 0

  return (
    <div className={s.pane}>
      <header className={s.head}>
        <span className={s.title}>团队</span>
        <span className={s.count}>
          {rows.length} 名成员 · {teams.length} 个团队
        </span>
        <span className="spacer" />
        <Button variant="secondary" size="sm" onClick={() => setForm({ mode: 'new' })} disabled={form !== null}>
          + 新成员
        </Button>
      </header>

      <div className={s.scroll}>
        <ErrorList errors={errors} />
        {empty && form === null && (
          <div className={s.guide}>
            <p>还没有人。顺序是「先建人，再组队」：</p>
            <ol>
              <li>
                对 codex 说，例如：
                <br />
                <code>用 team-builder 技能，加一个 codex 原生成员 reviewer，负责素材评审（先不进团队）</code>
              </li>
              <li>或点右上角「+ 新成员」手工登记；不填团队 = 进人员池。</li>
              <li>组队时说「从人员池挑 reviewer 和 builder 进游戏组」，团队里生成副本，原成员留在池里。</li>
            </ol>
            <p>codex 改动注册表后，这里几秒内自动刷新。</p>
          </div>
        )}
        {grouped.map(([team, members]) => (
          <section key={team || '__none'} className={s.group}>
            {team ? (
              <TeamWorkflowCard
                name={team}
                workflow={teams.find((t) => t.name === team)?.workflow ?? ''}
                spec={teams.find((t) => t.name === team)?.spec ?? ''}
                roster={teams.find((t) => t.name === team)?.roster ?? []}
                derived={derivedOf(team)}
                onSave={setWorkflow}
                onSaveSpec={setSpec}
                onMaterialize={async (name) => {
                  await materialize(name)
                }}
              />
            ) : (
              <h4 className={s.groupTitle}>人员池（团队只能从这里挑人）</h4>
            )}
            <div className={s.wall}>
              {members.map((m) => (
                <TeamMemberCard key={m.name} member={m} onEdit={() => setForm({ mode: 'edit', row: m })} onRemove={remove} />
              ))}
            </div>
          </section>
        ))}
        {extra.map((name) => (
          <section key={name} className={s.group}>
            <TeamWorkflowCard
              name={name}
              workflow={teams.find((t) => t.name === name)?.workflow ?? ''}
              spec={teams.find((t) => t.name === name)?.spec ?? ''}
              roster={teams.find((t) => t.name === name)?.roster ?? []}
              derived={derivedOf(name)}
              onSave={setWorkflow}
              onSaveSpec={setSpec}
              onMaterialize={async (teamName) => {
                await materialize(teamName)
              }}
            />
          </section>
        ))}
      </div>

      {form !== null && (
        <SubAgentForm
          initial={
            form.mode === 'edit'
              ? {
                  name: form.row.name,
                  kind: form.row.kind,
                  path: form.row.path,
                  desc: form.row.desc,
                  team: form.row.team ?? '',
                  model: form.row.model ?? '',
                  skills: (form.row.skills ?? []).join(', '),
                  mcpServers: (form.row.mcpServers ?? []).join(', '),
                  prompt: form.row.prompt ?? '',
                }
              : null
          }
          derivedFrom={form.mode === 'edit' ? form.row.derivedFrom : null}
          onSave={async (spec) => {
            if (form.mode === 'edit') await update(spec)
            else await register(spec)
            setForm(null)
          }}
          onCancel={() => setForm(null)}
        />
      )}
    </div>
  )
}
