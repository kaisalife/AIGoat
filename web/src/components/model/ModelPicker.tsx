import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Modal } from '../primitives'
import { openDialog } from '../../store/dialogs'
import { useShell } from '../../store/shell'
import s from './ModelPicker.module.css'

export interface ModelPickerProps {
  open: boolean
  onClose: () => void
}

/**
 * `/model` 选择器（14 号板块 §3.1）。
 *
 * # 数据源是本地自定义目录，不是 `model/list`
 *
 * 14 号文件把这条定为**不可动摇的立场**：codex 内置模型目录一概不用、不显示。
 * 所以这里读的是 `settings.json` 的模型列表。接 `model/list` 会产生两个
 * 真源，而自定义 provider 与内置目录并存时用户根本分不清哪个在生效。
 *
 * # 分组按 provider
 *
 * 同一个网关下常有多个模型（不同尺寸/档位），按 provider 分组才看得出
 * "它们其实是同一家"。
 */
export function ModelPicker({ open, onClose }: ModelPickerProps) {
  const settings = useShell((s) => s.settings)
  const modelId = useShell((s) => s.modelId)
  const setModel = useShell((s) => s.setModel)
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const catalog = settings?.models ?? []
    const q = query.trim().toLowerCase()
    const byProvider = new Map<string, typeof catalog>()
    for (const model of catalog) {
      if (q && !`${model.id}${model.displayName}`.toLowerCase().includes(q)) continue
      const bucket = byProvider.get(model.providerId)
      if (bucket) bucket.push(model)
      else byProvider.set(model.providerId, [model])
    }
    return [...byProvider].map(([providerId, models]) => {
      const provider = settings?.providers.find((p) => p.id === providerId)
      return {
        providerId,
        name: provider?.name ?? providerId,
        host: hostOf(provider?.baseUrl),
        models,
      }
    })
  }, [settings, query])

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="narrow"
      title="切换模型"
      description="内置模型目录不参与：这里只列你在设置里自定义的模型。"
      footer={
        <>
          <span className="spacer" />
          <button
            type="button"
            className={s.manage}
            onClick={() => {
              onClose()
              openDialog('settings')
            }}
          >
            管理模型…
          </button>
        </>
      }
    >
      <input
        className={s.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="按名称或 ID 过滤"
        aria-label="过滤模型"
        autoFocus
      />

      {groups.length === 0 && <p className={s.empty}>没有匹配的模型。</p>}

      {groups.map((group) => (
        <section key={group.providerId} className={s.group}>
          <h3 className={s.head}>
            <span className={s.groupName}>{group.name}</span>
            {group.host && <span className={s.host}>{group.host}</span>}
          </h3>
          {group.models.map((model) => (
            <button
              key={model.id}
              type="button"
              className={clsx(s.row, model.id === modelId && s.active)}
              onClick={() => {
                setModel(model.id)
                onClose()
              }}
            >
              <span className={s.name}>{model.displayName}</span>
              <span className={s.spacer} />
              {model.reasoningEffort && (
                <span className={s.badge} title="推理档位">
                  {model.reasoningEffort}
                </span>
              )}
              {model.contextWindow ? (
                <span className={s.badge} title="上下文窗口">
                  {formatContext(model.contextWindow)}
                </span>
              ) : null}
              <code className={s.id}>{model.id}</code>
            </button>
          ))}
        </section>
      ))}
    </Modal>
  )
}

/** Base URL 的域名部分。组头上显示它，省得用户分不清两个同名网关。 */
function hostOf(baseUrl: string | undefined): string {
  if (!baseUrl) return ''
  try {
    return new URL(baseUrl).host
  } catch {
    return ''
  }
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`
  return String(tokens)
}
