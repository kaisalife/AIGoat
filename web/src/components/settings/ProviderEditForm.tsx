import clsx from 'clsx'
import { useState } from 'react'
import type { ProviderConfig } from '../../bridge/client'
import { Button, Switch } from '../primitives'
import { RESERVED_PROVIDER_IDS, authModeOf, type AuthMode } from './defaults'
import f from './SettingsFields.module.css'

export interface ProviderEditFormProps {
  /** null = 新建。 */
  initial: ProviderConfig | null
  onSave: (provider: ProviderConfig) => void
  onCancel: () => void
}

/**
 * 提供商编辑表单（**独有功能**：连接到哪、走什么鉴权）。
 *
 * 校验规则与 settings.rs 的 `validate_providers` 同源但更早：这里挡住
 * 用户点击，壳侧那道是最后一道（防止手改配置文件绕过界面）。
 * 错误就地显示，不弹窗——弹窗会让用户对不上是哪个字段错了。
 */
export function ProviderEditForm({ initial, onSave, onCancel }: ProviderEditFormProps) {
  const [id, setId] = useState(initial?.id ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '')
  const [mode, setMode] = useState<AuthMode>(initial ? authModeOf(initial) : 'env')
  const [envKey, setEnvKey] = useState(initial?.envKey ?? '')
  // 壳从不下发明文 Key（读取时 apiKey 为 null）：这里**永不回填**，留空提交
  // 表示"保持原 Key"（由壳侧 merge），填了才覆盖。
  const [apiKey, setApiKey] = useState('')
  // 「路径即端点」网关（火山 Agent Plan 等）：base_url 直接就是 POST 目标，
  // codex 不能再拼 /responses。开这个开关 = 提交 responsesPath: ""。
  const [verbatimBaseUrl, setVerbatimBaseUrl] = useState(initial?.responsesPath === '')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const trimmedId = id.trim()
    if (!trimmedId) return setError('ID 不能为空。')
    if (RESERVED_PROVIDER_IDS.includes(trimmedId)) {
      return setError(`「${trimmedId}」是保留 ID，请换一个。`)
    }
    if (!/^[\w-]+$/.test(trimmedId)) return setError('ID 只能包含字母、数字、- 和 _。')
    if (!name.trim()) return setError('显示名称不能为空。')
    // 必须显式给 base_url：留空会静默回落到 chatgpt/openai 端点，
    // 表现为请求发到了别处，而不是一个明显的错误。
    if (!/^https?:\/\//.test(baseUrl.trim())) {
      return setError('Base URL 必须以 http:// 或 https:// 开头。')
    }
    if (mode === 'env' && !/^[A-Za-z_]\w*$/.test(envKey.trim())) {
      return setError('环境变量名不合法（字母/数字/下划线，不能以数字开头）。')
    }
    onSave({
      id: trimmedId,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      envKey: mode === 'env' ? envKey.trim() : undefined,
      apiKey: mode === 'local' ? apiKey : undefined,
      responsesPath: verbatimBaseUrl ? '' : null,
    })
  }

  return (
    <div className={f.form}>
      {error && <p className="settings__error">{error}</p>}
      <div className={f.grid}>
        <label className={f.field}>
          <span className={f.label}>ID *</span>
          <input
            className={f.input}
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="my-gateway"
            // id 是发进 `-c model_providers.<id>` 的键，也是 settings.json 里的
            // 主键；改了会让所有指向它的模型悬空，所以创建后锁定。
            disabled={initial !== null}
            title={initial ? '创建后不可修改' : undefined}
          />
        </label>
        <label className={f.field}>
          <span className={f.label}>显示名称 *</span>
          <input
            className={f.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="我的网关"
          />
        </label>
        <label className={clsx(f.field, f.full)}>
          <span className={f.label}>Base URL *</span>
          <input
            className={f.input}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
          />
          <span className={f.hint}>必须显式填写；协议固定使用 responses 线格式。</span>
        </label>
        <div className={clsx(f.field, f.full)}>
          <span className={f.label}>Responses 请求路径</span>
          <Switch
            checked={verbatimBaseUrl}
            label="直接使用 Base URL（不追加 /responses）"
            onChange={setVerbatimBaseUrl}
          />
          <span className={f.hint}>
            默认请求 <code>{'{base_url}/responses'}</code>。火山 Agent Plan 这类
            「base_url 即端点」的网关打开本开关（提交 <code>responses_path: ""</code>，
            需要 patched codex）。
          </span>
        </div>
        <label className={f.field}>
          <span className={f.label}>鉴权方式</span>
          <select
            className={f.input}
            value={mode}
            onChange={(e) => setMode(e.target.value as AuthMode)}
          >
            <option value="env">环境变量（推荐，Key 不落盘）</option>
            <option value="local">直接填写（保存在本机配置）</option>
            <option value="none">无鉴权（本地服务）</option>
          </select>
        </label>
        {mode === 'env' && (
          <label className={f.field}>
            <span className={f.label}>环境变量名 *</span>
            <input
              className={f.input}
              value={envKey}
              onChange={(e) => setEnvKey(e.target.value)}
              placeholder="MY_API_KEY"
            />
          </label>
        )}
        {mode === 'local' && (
          <label className={f.field}>
            <span className={f.label}>API Key</span>
            <input
              className={f.input}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={initial?.hasApiKey ? '已保存（留空保持不变）' : 'sk-…'}
            />
            <span className={f.hint}>
              保存在本机应用配置目录，不会写进 codex 配置。已存过 Key 时留空即保持不变。
            </span>
          </label>
        )}
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