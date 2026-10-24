import clsx from 'clsx'
import { useState } from 'react'
import type { SubAgentKind, SubAgentSpec } from '../../bridge/contract'
import { Button } from '../primitives'
import f from './SettingsFields.module.css'

export interface SubAgentFormValues {
  name: string
  kind: SubAgentKind
  path: string
  desc: string
  team: string
  model: string
  skills: string
  mcpServers: string
  prompt: string
}

export interface SubAgentFormProps {
  /** null = 新建。 */
  initial: SubAgentFormValues | null
  /** 编辑团队特化副本时传入来源成员名，表单顶部给出"改动会被覆盖"的提示。 */
  derivedFrom?: string | null
  onSave: (spec: SubAgentSpec) => Promise<void>
  onCancel: () => void
}

/** 逗号分隔名单 → 去空去重的数组。 */
function parseList(text: string): string[] {
  const out: string[] = []
  for (const part of text.split(/[,，;；\n]/)) {
    const v = part.trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

/**
 * 子 Agent 登记/编辑表单。
 *
 * `desc`（何时派）不是备注，而是**主 agent 会不会想到它**的唯一依据——
 * 派单说明只注入这段文字，它写得太含糊，子 agent 就永远不会被派活。
 * 所以字段名和占位文案都往「决定要不要派」上靠。
 *
 * 两种接入方式字段面完全不同：外部进程要 exe 路径；codex 原生没有 exe，
 * 配的是模型/技能/MCP/角色提示词——这些经 `-c agents.*` 随下一次连接
 * 写进 codex 配置，表单里如实标注生效时机。
 */
export function SubAgentForm({ initial, derivedFrom, onSave, onCancel }: SubAgentFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<SubAgentKind>(initial?.kind ?? 'external')
  const [path, setPath] = useState(initial?.path ?? '')
  const [desc, setDesc] = useState(initial?.desc ?? '')
  const [team, setTeam] = useState(initial?.team ?? '')
  const [model, setModel] = useState(initial?.model ?? '')
  const [skills, setSkills] = useState(initial?.skills ?? '')
  const [mcpServers, setMcpServers] = useState(initial?.mcpServers ?? '')
  const [prompt, setPrompt] = useState(initial?.prompt ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) return setError('名称不能为空。')
    if (kind === 'external' && !path.trim()) {
      return setError('请填写子 agent 可执行文件的绝对路径。')
    }
    setBusy(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        kind,
        path: kind === 'external' ? path.trim() : null,
        desc: desc.trim(),
        team: team.trim() || null,
        model: kind === 'codex' ? model.trim() || null : null,
        skills: kind === 'codex' ? parseList(skills) : null,
        mcpServers: kind === 'codex' ? parseList(mcpServers) : null,
        prompt: kind === 'codex' ? prompt.trim() || null : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className={f.form}>
      {error && <p className="settings__error">{error}</p>}
      {derivedFrom && (
        <p className={f.hint}>
          这是「{derivedFrom}」的团队特化副本：手改只影响这个副本，下次重跑特化会被覆盖。
        </p>
      )}
      <div className={f.grid}>
        <label className={f.field}>
          <span className={f.label}>名称 *</span>
          <input
            className={f.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="sprite-maker"
            // 名称是注册表主键，改名等于注销一个再登记一个，历史派单会对不上。
            disabled={initial !== null}
            title={initial ? '名称是注册表主键，不可修改' : undefined}
          />
        </label>
        <div className={f.field} role="radiogroup" aria-label="接入方式">
          <span className={f.label}>接入方式 *</span>
          <div className={f.inline}>
            {(
              [
                ['external', '外部进程（任务单协议）'],
                ['codex', 'codex 原生（collab）'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                className={clsx(f.choice, kind === value && f.choiceOn)}
                onClick={() => setKind(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className={clsx(f.field, f.full)}>
          <span className={f.label}>何时派（决定主 agent 会不会想到它）</span>
          <input
            className={f.input}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="游戏素材/动画/特效/图集生成"
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>团队（可选）</span>
          <input
            className={f.input}
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            placeholder="游戏组"
          />
          <span className={f.hint}>同队成员在派单说明里编入同一组，跨协议也能混编。</span>
        </label>
        {kind === 'external' ? (
          <label className={f.field}>
            <span className={f.label}>可执行文件绝对路径 *</span>
            <input
              className={f.input}
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="D:\path\to\project\src-tauri\target\release\my-agent.exe"
            />
            <span className={f.hint}>
              必须是已构建的 release 可执行文件；登记后本体原地不动，不复制到本项目。
            </span>
          </label>
        ) : (
          <>
            <label className={f.field}>
              <span className={f.label}>模型（可选）</span>
              <input
                className={f.input}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="留空跟随主会话模型"
              />
            </label>
            <label className={f.field}>
              <span className={f.label}>技能（可选，逗号分隔）</span>
              <input
                className={f.input}
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="find-papers, summarize"
              />
            </label>
            <label className={clsx(f.field, f.full)}>
              <span className={f.label}>MCP 服务器（可选，逗号分隔 id）</span>
              <input
                className={f.input}
                value={mcpServers}
                onChange={(e) => setMcpServers(e.target.value)}
                placeholder="fetch, sqlite"
              />
              <span className={f.hint}>id 须已存在于 codex 配置（右栏 MCP 面板可见）。</span>
            </label>
            <label className={clsx(f.field, f.full)}>
              <span className={f.label}>角色提示词（可选）</span>
              <textarea
                className={f.input}
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="你是素材评审员：只做质量判定，不改文件…"
              />
            </label>
          </>
        )}
      </div>
      {kind === 'codex' && (
        <p className="settings__hint">
          codex 原生成员写成 codex 角色文件（<code>~/.codex/agents/</code> 下，codex 自动发现），随下一次连接生效；技能按名启用，MCP 以 id 写进角色指令。
        </p>
      )}
      <div className={f.actions}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          取消
        </Button>
        <Button variant="primary" onClick={() => void submit()} loading={busy}>
          {initial ? '保存' : '登记'}
        </Button>
      </div>
    </div>
  )
}
