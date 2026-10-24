import { useCallback, useEffect, useState } from 'react'
import type { ModelConfig, ProviderConfig, SettingsData } from '../../bridge/client'
import { getClient } from '../../bridge/session'
import { DEFAULT_UI_PREFS } from './defaults'

export interface ModelSettings {
  draft: SettingsData
  configPath: string
  loaded: boolean
  saving: boolean
  errors: string[]
  reload: () => Promise<void>
  save: () => Promise<void>
  setWebSearch: (next: boolean) => void
  reveal: () => void
  setActiveModel: (id: string) => void
  saveProvider: (index: number | 'new', provider: ProviderConfig) => void
  removeProvider: (index: number) => void
  saveModel: (index: number | 'new', model: ModelConfig) => void
  removeModel: (index: number) => void
}

const EMPTY: SettingsData = {
  version: 1,
  providers: [],
  models: [],
  activeModelId: null,
  ui: DEFAULT_UI_PREFS,
  webSearch: false,
}

/**
 * 模型域的状态（**独有功能**，00 铁律 3：不用 codex 内置模型目录）。
 *
 * 逻辑从旧的 850 行 SettingsDialog 原样搬过来——校验规则、默认值唯一化、
 * 删除提供商时连带清理指向它的模型、坏文件重开 app。这些都是踩过坑的地方，
 * 一条都不该在拆分时改。
 *
 * 保存后会重启 codex，因此成功路径上整页刷新：重连之后所有派生状态
 * （连接信息、模型目录、余量条）都要重建，与其手工同步不如重来一次。
 */
export function useModelSettings(): ModelSettings {
  const [draft, setDraft] = useState<SettingsData>(EMPTY)
  const [configPath, setConfigPath] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const reload = useCallback(async () => {
    setLoaded(false)
    setErrors([])
    try {
      const payload = await getClient().getSettings()
      setDraft(payload.settings)
      setConfigPath(payload.configPath)
    } catch (err) {
      setErrors([describe(err)])
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(async () => {
    setSaving(true)
    setErrors([])
    try {
      // 先在壳侧完整校验；通过则落盘并重启 codex，然后整页刷新重建状态。
      await getClient().applySettings(draft)
      window.location.reload()
    } catch (err) {
      setErrors(describe(err).split('\n'))
      setSaving(false)
    }
  }, [draft])

  return {
    draft,
    configPath,
    loaded,
    saving,
    errors,
    reload,
    save,
    setWebSearch: (next: boolean) => setDraft((d) => ({ ...d, webSearch: next })),
    reveal: () => void getClient().revealSettingsFile(),
    setActiveModel: (id) => setDraft((d) => ({ ...d, activeModelId: id })),
    saveProvider: (index, provider) =>
      setDraft((d) => {
        const providers = [...d.providers]
        if (index === 'new') providers.push(provider)
        else providers[index] = provider
        // 删除/改名后，模型可能指向不存在的提供商，这里同步清理。
        const models = d.models.filter((m) => providers.some((x) => x.id === m.providerId))
        return {
          ...d,
          providers,
          models,
          activeModelId: models.some((m) => m.id === d.activeModelId)
            ? d.activeModelId
            : (models[0]?.id ?? null),
        }
      }),
    removeProvider: (index) =>
      setDraft((d) => {
        const models = d.models.filter((m) => m.providerId !== d.providers[index]?.id)
        return {
          ...d,
          providers: d.providers.filter((_, j) => j !== index),
          models,
          activeModelId: models.some((m) => m.id === d.activeModelId)
            ? d.activeModelId
            : (models[0]?.id ?? null),
        }
      }),
    saveModel: (index, model) =>
      setDraft((d) => {
        const models = [...d.models]
        if (index === 'new') models.push(model)
        else models[index] = model
        // 默认标记唯一化；新默认/编辑为默认时清掉其它默认。
        if (model.isDefault) {
          for (const other of models) {
            if (other !== model) other.isDefault = false
          }
        }
        if (!models.some((m) => m.isDefault) && models[0]) models[0].isDefault = true
        return {
          ...d,
          models,
          activeModelId: models.some((m) => m.id === d.activeModelId)
            ? d.activeModelId
            : (models[0]?.id ?? null),
        }
      }),
    removeModel: (index) =>
      setDraft((d) => {
        const models = d.models.filter((_, j) => j !== index)
        return {
          ...d,
          models,
          activeModelId: models.some((m) => m.id === d.activeModelId)
            ? d.activeModelId
            : (models[0]?.id ?? null),
        }
      }),
  }
}

export function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}