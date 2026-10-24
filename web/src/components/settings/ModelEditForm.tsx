import clsx from 'clsx'
import { useState } from 'react'
import type { ModelConfig, ProviderConfig } from '../../bridge/client'
import { Button, Switch } from '../primitives'
import f from './SettingsFields.module.css'

export interface ModelEditFormProps {
  providers: ProviderConfig[]
  /** null = 新建。 */
  initial: ModelConfig | null
  onSave: (model: ModelConfig) => void
  onCancel: () => void
}

/**
 * 模型编辑表单（**独有功能**：模型目录完全由用户定义）。
 *
 * 上下文窗口只影响界面上的余量条（13 期），不发回 codex——它自己知道
 * 窗口多大，我们只是把用户填的数字拿来画图。所以留空是合法状态，
 * 不是「未知」状态。
 */
export function ModelEditForm({ providers, initial, onSave, onCancel }: ModelEditFormProps) {
  const [id, setId] = useState(initial?.id ?? '')
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '')
  const [providerId, setProviderId] = useState(
    initial?.providerId ?? (providers.length === 1 ? (providers[0]?.id ?? '') : ''),
  )
  const [reasoningEffort, setReasoningEffort] = useState(initial?.reasoningEffort ?? '')
  const [contextWindow, setContextWindow] = useState(
    initial?.contextWindow ? String(initial.contextWindow) : '',
  )
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false)
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (!id.trim()) return setError('模型 ID 不能为空。')
    if (!displayName.trim()) return setError('显示名称不能为空。')
    if (!providerId) return setError('请选择所属提供商。')
    onSave({
      id: id.trim(),
      displayName: displayName.trim(),
      providerId,
      reasoningEffort: reasoningEffort.trim() || undefined,
      contextWindow: contextWindow.trim() ? Number(contextWindow.trim()) : undefined,
      isDefault,
    })
  }

  return (
    <div className={f.form}>
      {error && <p className="settings__error">{error}</p>}
      <div className={f.grid}>
        <label className={f.field}>
          <span className={f.label}>显示名称 *</span>
          <input
            className={f.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="我的 70B 模型"
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>模型 ID *</span>
          <input
            className={f.input}
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="deepseek-chat-v3"
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>所属提供商 *</span>
          <select
            className={f.input}
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
          >
            <option value="">选择…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>推理档位</span>
          <input
            className={f.input}
            value={reasoningEffort}
            onChange={(e) => setReasoningEffort(e.target.value)}
            placeholder="留空 = 服务端默认（low / medium / high…）"
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>上下文窗口（token）</span>
          <input
            className={f.input}
            value={contextWindow}
            onChange={(e) => setContextWindow(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="如 131072；留空则不显示余量条"
          />
        </label>
        <div className={clsx(f.field, f.check)}>
          <Switch
            checked={isDefault}
            onChange={setIsDefault}
            label="设为默认模型"
          />
          <span className={f.label}>设为默认模型</span>
        </div>
      </div>
      <div className={f.actions}>
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button variant="primary" onClick={submit}>
          确认
        </Button>
      </div>
    </div>
  )
}