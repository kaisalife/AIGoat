import clsx from 'clsx'
import { useCallback, useEffect, useState } from 'react'
import type { McpDefinitionRow } from '../../../bridge/client'
import { getClient } from '../../../bridge/session'
import { describe } from '../useModelSettings'
import { Button } from '../../primitives'
import { RowButton } from './shared'
import f from '../SettingsFields.module.css'
import l from '../SettingsList.module.css'

/**
 * MCP 服务器定义管理（子 Agent 域内）。
 *
 * 数据来自 codex 配置的 `mcp_servers` 表；写通道是 `config/value/write`
 * （mergeStrategy=replace）+ `config/mcpServer/reload` 热重载。删除用
 * `value: null` 交由 codex 裁决——当前版本不支持时错误原样显示。
 */

interface Draft {
  id: string
  kind: 'stdio' | 'http'
  command: string
  args: string
  url: string
}

const emptyDraft: Draft = { id: '', kind: 'stdio', command: '', args: '', url: '' }

function draftOf(row: McpDefinitionRow): Draft {
  return {
    id: row.id,
    kind: row.kind === 'http' ? 'http' : 'stdio',
    command: row.command ?? '',
    args: (row.args ?? []).join('\n'),
    url: row.url ?? '',
  }
}

function definitionOf(draft: Draft): Record<string, unknown> {
  if (draft.kind === 'http') {
    return { url: draft.url.trim() }
  }
  const args = draft.args
    .split('\n')
    .map((a) => a.trim())
    .filter(Boolean)
  return { command: draft.command.trim(), args }
}

export function McpServersSection() {
  const [rows, setRows] = useState<McpDefinitionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      setRows(await getClient().mcpDefinitions())
      setError(null)
    } catch (err) {
      setError(`读取 MCP 配置失败（需要先连接 codex）：${describe(err)}`)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = async () => {
    if (!draft) return
    if (!draft.id.trim()) return setError('服务器 id 不能为空。')
    if (draft.kind === 'stdio' && !draft.command.trim()) return setError('stdio 服务器需要 command。')
    if (draft.kind === 'http' && !draft.url.trim()) return setError('http 服务器需要 url。')
    setBusy(true)
    setError(null)
    try {
      await getClient().mcpDefinitionWrite(draft.id.trim(), definitionOf(draft))
      setDraft(null)
      await reload()
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (row: McpDefinitionRow) => {
    setBusy(true)
    setError(null)
    try {
      await getClient().mcpDefinitionRemove(row.id)
      await reload()
    } catch (err) {
      setError(`当前 codex 版本拒绝了删除（可在其配置文件手动移除）：${describe(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="settings__hint">
        <b>MCP 服务器</b>（写进 codex 配置并热重载；子 Agent 域里的 codex 原生成员按 id 引用它们）
      </h3>
      {error && <p className="settings__error">{error}</p>}
      <ul className={l.list}>
        {rows.map((row) => (
          <li key={row.id} className={l.row}>
            <div className={l.rowMain}>
              <span className={l.rowTitle}>
                {row.id}
                <span className={l.badge}>{row.kind}</span>
              </span>
              <code className={l.rowCode}>
                {row.kind === 'stdio'
                  ? [row.command, (row.args ?? []).join(' ')].filter(Boolean).join(' ')
                  : row.url}
              </code>
            </div>
            <RowButton
              onClick={() => setDraft(draftOf(row))}
              disabled={draft !== null || busy}
            >
              编辑
            </RowButton>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void remove(row)}
              disabled={draft !== null || busy}
            >
              删除
            </Button>
          </li>
        ))}
      </ul>

      {draft === null ? (
        <Button variant="ghost" size="sm" onClick={() => setDraft({ ...emptyDraft })}>
          + 新增 MCP 服务器
        </Button>
      ) : (
        <div className={f.form}>
          <div className={f.grid}>
            <label className={f.field}>
              <span className={f.label}>id *</span>
              <input
                className={f.input}
                value={draft.id}
                disabled={rows.some((r) => r.id === draft.id)}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                placeholder="fetch"
              />
            </label>
            <div className={f.field} role="radiogroup" aria-label="传输类型">
              <span className={f.label}>类型</span>
              <div className={f.inline}>
                {(['stdio', 'http'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={draft.kind === k}
                    className={clsx(f.choice, draft.kind === k && f.choiceOn)}
                    onClick={() => setDraft({ ...draft, kind: k })}
                  >
                    {k === 'stdio' ? '本地进程' : 'HTTP'}
                  </button>
                ))}
              </div>
            </div>
            {draft.kind === 'stdio' ? (
              <>
                <label className={f.field}>
                  <span className={f.label}>command *</span>
                  <input
                    className={f.input}
                    value={draft.command}
                    onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                    placeholder="npx"
                  />
                </label>
                <label className={f.field}>
                  <span className={f.label}>args（每行一个）</span>
                  <textarea
                    className={f.input}
                    rows={3}
                    value={draft.args}
                    onChange={(e) => setDraft({ ...draft, args: e.target.value })}
                    placeholder={'-y\n@modelcontextprotocol/server-fetch'}
                  />
                </label>
              </>
            ) : (
              <label className={f.field}>
                <span className={f.label}>url *</span>
                <input
                  className={f.input}
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://example.com/mcp"
                />
              </label>
            )}
          </div>
          <div className={f.actions}>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void save()} loading={busy}>
              保存并重载
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
