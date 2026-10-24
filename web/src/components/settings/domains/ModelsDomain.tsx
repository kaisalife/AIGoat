import { useState } from 'react'
import { Button, Switch } from '../../primitives'
import { ModelSection } from './ModelSection'
import { ProviderSection } from './ProviderSection'
import { ErrorList, toggleConfirm, type EditSlot } from './shared'
import { useModelSettings } from '../useModelSettings'

/**
 * 模型域（**独有功能**，00 铁律 3：不用 codex 内置模型目录）。
 *
 * 两层结构：提供商（连接到哪）与模型（用哪个）。全部由用户手填；
 * 保存后壳用新配置重启 codex，所以这一域带自己的保存按钮——
 * 通用偏好那种改一下就该生效的设置不适合放这里。
 *
 * 这里只管**哪个域**、草稿怎么改、错误显示在哪；列表与表单各自成文件。
 */
export function ModelsDomain() {
  const {
    draft,
    setWebSearch,
    configPath,
    loaded,
    saving,
    errors,
    save,
    reveal,
    setActiveModel,
    saveProvider,
    removeProvider,
    saveModel,
    removeModel,
  } = useModelSettings()

  const [editProvider, setEditProvider] = useState<EditSlot>(null)
  const [editModel, setEditModel] = useState<EditSlot>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  if (!loaded) return <p className="settings__loading">读取配置中…</p>

  const cancelConfirm = () => setConfirming(null)

  return (
    <>
      <ErrorList errors={errors} />

      <ProviderSection
        providers={draft.providers}
        models={draft.models}
        edit={editProvider}
        confirming={confirming}
        onEdit={setEditProvider}
        onAskRemove={(key) => setConfirming((c) => toggleConfirm(c, key))}
        onCancelConfirm={cancelConfirm}
        onSave={(index, provider) => {
          saveProvider(index, provider)
          setEditProvider(null)
        }}
        onRemove={(index) => {
          removeProvider(index)
          cancelConfirm()
        }}
      />

      <ModelSection
        models={draft.models}
        providers={draft.providers}
        activeModelId={draft.activeModelId}
        edit={editModel}
        confirming={confirming}
        onEdit={setEditModel}
        onAskRemove={(key) => setConfirming((c) => toggleConfirm(c, key))}
        onCancelConfirm={cancelConfirm}
        onSetActive={setActiveModel}
        onSave={(index, model) => {
          saveModel(index, model)
          setEditModel(null)
        }}
        onRemove={(index) => {
          removeModel(index)
          cancelConfirm()
        }}
      />

      <div className="settings__path">
        <code title={configPath}>{configPath || '（不可用）'}</code>
        <span className="settings__path-note">
          与程序放在一起；选「环境变量」方式时 API Key 不落盘。
        </span>
        <Button variant="ghost" onClick={reveal} title="在资源管理器中定位 settings.json">
          打开位置
        </Button>
      </div>

      {/* 工具开关：codex 上游对 update_plan/web_search 的默认值偏保守 */}
      <div
        className="settings__footer settings__footer--inline"
        style={{ alignItems: 'center' }}
      >
        <Switch
          checked={draft.webSearch}
          label="启用网页搜索工具"
          onChange={setWebSearch}
        />
        <span className="settings__footer-note">
          网页搜索（tools.web_search）由模型服务端实现——第三方中转不支持时调用会报错；
          计划工具（update_plan）默认已开启。
        </span>
      </div>

      <div className="settings__footer settings__footer--inline">
        <span className="settings__footer-note">
          提供商与模型变更需要重启 codex 连接；保存后界面会自动刷新。
        </span>
        <Button variant="primary" onClick={() => void save()} loading={saving}>
          保存并重连
        </Button>
      </div>
    </>
  )
}