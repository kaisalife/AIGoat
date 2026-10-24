import clsx from 'clsx'
import type { SettingsData } from '../../../bridge/client'
import { ModelEditForm } from '../ModelEditForm'
import l from '../SettingsList.module.css'
import {
  ConfirmBar,
  confirmKey,
  RowButton,
  RowDangerButton,
  SectionHeader,
  type EditSlot,
} from './shared'

export interface ModelSectionProps {
  models: SettingsData['models']
  providers: SettingsData['providers']
  activeModelId: string | null
  edit: EditSlot
  confirming: string | null
  onEdit: (slot: EditSlot) => void
  onAskRemove: (key: string) => void
  onCancelConfirm: () => void
  onSetActive: (id: string) => void
  onSave: (index: number | 'new', model: SettingsData['models'][number]) => void
  onRemove: (index: number) => void
}

/**
 * 模型列表 + 编辑表单。
 *
 * 与 ProviderSection 同构，多的只有「设为当前」——它改的是
 * `activeModelId`，下次起会话生效，不用重启连接（所以能立刻改）。
 */
export function ModelSection(props: ModelSectionProps) {
  const {
    models,
    providers,
    activeModelId,
    edit,
    confirming,
    onEdit,
    onAskRemove,
    onCancelConfirm,
    onSetActive,
    onSave,
    onRemove,
  } = props

  return (
    <section className="settings__section">
      <SectionHeader
        title="模型"
        count={models.length}
        action="+ 新增模型"
        onAction={() => onEdit('new')}
        disabled={providers.length === 0 || edit !== null}
        title2={providers.length === 0 ? '先添加提供商' : undefined}
      />

      {models.length === 0 && edit === null && (
        <p className="settings__empty">
          还没有模型。添加后它就是唯一的可选模型——内置目录不再出现。
        </p>
      )}

      {edit !== null ? (
        <ModelEditForm
          providers={providers}
          initial={edit === 'new' ? null : (models[edit] ?? null)}
          onSave={(m) => onSave(edit, m)}
          onCancel={() => onEdit(null)}
        />
      ) : (
        <ul className={l.list}>
          {models.map((m, i) => {
            const key = confirmKey('model', m.id)
            return (
              <li key={m.id} className={l.row}>
                <div className={l.rowMain}>
                  <span className={l.rowTitle}>
                    {m.displayName}
                    {activeModelId === m.id && <span className={clsx(l.badge, l.badgeOk)}>当前</span>}
                    {m.isDefault && activeModelId !== m.id && <span className={l.badge}>默认</span>}
                  </span>
                  <code className={l.rowCode}>
                    {m.id} · {providers.find((p) => p.id === m.providerId)?.name ?? '?'}
                    {m.reasoningEffort ? ` · ${m.reasoningEffort}` : ''}
                  </code>
                </div>
                {confirming === key ? (
                  <ConfirmBar
                    text="确认删除？"
                    onConfirm={() => onRemove(i)}
                    onCancel={onCancelConfirm}
                  />
                ) : (
                  <>
                    <RowButton onClick={() => onSetActive(m.id)} disabled={activeModelId === m.id}>
                      设为当前
                    </RowButton>
                    <RowButton onClick={() => onEdit(i)} disabled={edit !== null}>
                      编辑
                    </RowButton>
                    <RowDangerButton onClick={() => onAskRemove(key)} disabled={edit !== null}>
                      删除
                    </RowDangerButton>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}