import clsx from 'clsx'
import { useState } from 'react'
import type { SubAgentRow } from '../../../bridge/client'
import { useShell } from '../../../store/shell'
import { CodeBlock } from '../../primitives'
import { McpServersSection } from './McpServersSection'
import { SkillsSection } from './SkillsSection'
import { SubAgentForm } from '../SubAgentForm'
import { useSubAgents } from '../useSubAgents'
import { ConfirmBar, ErrorList, RowButton, RowDangerButton, SectionHeader } from './shared'
import { TeamsSection } from './TeamsSection'
import l from '../SettingsList.module.css'

/**
 * 子 Agent 域（**独有功能**：AF 规范接入，00 铁律 3）。
 *
 * 三块：CRUD、本机状态、注入预览。最后一块最有用——派单说明是拼进
 * thread/start 的 `developerInstructions` 的，用户在这里看到的就是主
 * agent 真正会看到的那段文字，不用去翻 rollout。
 *
 * 成员两类：外部进程（改完即生效）与 codex 原生（能力面随下一次连接经
 * `-c agents.*` 写进 codex 配置，改完要点一次重连）。
 */
export function SubagentsDomain() {
  const { rows, teams, instructions, errors, remove, register, update, setWorkflow } = useSubAgents()
  const cwd = useShell((s) => s.cwd)
  const [form, setForm] = useState<{ mode: 'new' } | { mode: 'edit'; row: SubAgentRow } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const cancelConfirm = () => setConfirming(null)

  return (
    <section className="settings__section">
      <SectionHeader
        title="子 Agent"
        count={rows.length}
        action="+ 登记子 Agent"
        onAction={() => setForm({ mode: 'new' })}
        disabled={form !== null}
      />

      <ErrorList errors={errors} />

      <p className="settings__hint">
        两种接入方式可以编进同一个团队：<b>外部进程</b>按 AF 规范走任务单协议
        （<code>{'<exe> --agent task.json --out report.json'}</code>，退出码 0/1），
        地址只登记进注册表（<code>~/.agent-registry/registry.json</code>）；
        <b>codex 原生</b>成员由 codex 的协作工具（spawn_agent）拉起，可配模型/技能/MCP，角色文件随下一次连接被 codex 自动发现。登记后派单说明随新会话注入，主 agent 无需额外配置即可派活。
      </p>

      {rows.length === 0 && form === null && (
        <p className="settings__empty">还没有登记子 agent。登记后这个界面会显示成员的本机状态。</p>
      )}

      <ul className={l.list}>
        {rows.map((a) => {
          const key = `subagent:${a.name}`
          const native = a.kind === 'codex'
          return (
            <li key={a.name} className={l.row}>
              <div className={l.rowMain}>
                <span className={l.rowTitle}>
                  {a.name}
                  <span className={clsx(l.badge, native ? l.badgeOk : l.badge)}>
                    {native ? 'codex 原生' : '外部进程'}
                  </span>
                  {a.team && <span className={clsx(l.badge, l.badge)}>{a.team}</span>}
                  {a.kind === 'external' &&
                    (a.exeExists ? (
                      <span className={clsx(l.badge, l.badgeOk)}>就绪</span>
                    ) : (
                      <span className={clsx(l.badge, l.badgeDanger)}>exe 缺失</span>
                    ))}
                </span>
                {a.kind === 'external' ? (
                  <code className={l.rowCode} title={a.path}>
                    {a.path}
                  </code>
                ) : (
                  <code className={l.rowCode}>
                    {[a.model, a.skills?.join(' / '), a.mcpServers?.join(' / ')]
                      .filter(Boolean)
                      .join(' ｜ ') || '未配能力面'}
                  </code>
                )}
                {a.desc && <span className={l.rowDesc}>{a.desc}</span>}
                {a.kind === 'external' && (a.capabilityManifest || a.skillDoc) && (
                  <span className={l.rowDesc}>
                    {a.capabilityManifest ? '能力清单 ✓ ' : ''}
                    {a.skillDoc ? '派单细则 ✓' : ''}
                  </span>
                )}
              </div>
              {confirming === key ? (
                <ConfirmBar
                  text={`确认注销「${a.name}」？`}
                  onConfirm={() => {
                    cancelConfirm()
                    void remove(a.name)
                  }}
                  onCancel={cancelConfirm}
                />
              ) : (
                <>
                  <RowButton onClick={() => setForm({ mode: 'edit', row: a })} disabled={form !== null}>
                    编辑
                  </RowButton>
                  <RowDangerButton onClick={() => setConfirming(key)} disabled={form !== null}>
                    注销
                  </RowDangerButton>
                </>
              )}
            </li>
          )
        })}
      </ul>

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
          onSave={async (spec) => {
            if (form.mode === 'edit') await update(spec)
            else await register(spec)
            setForm(null)
          }}
          onCancel={() => setForm(null)}
        />
      )}

      <TeamsSection teams={teams} onSave={setWorkflow} />

      {instructions !== null && (
        <details className="settings__preview">
          <summary>预览注入会话的派单说明（{instructions.length} 字符）</summary>
          <CodeBlock code={instructions} title="developerInstructions" />
        </details>
      )}

      {/* 团队成员消费的能力面：MCP 定义与技能开关都在这里配 */}
      <McpServersSection />
      <SkillsSection cwd={cwd} />
    </section>
  )
}