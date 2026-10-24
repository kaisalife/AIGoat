import type { SettingsData } from '../../../bridge/client'
import { ProviderEditForm } from '../ProviderEditForm'
import { authLabel } from '../defaults'
import l from '../SettingsList.module.css'
import {
  ConfirmBar,
  confirmKey,
  RowButton,
  RowDangerButton,
  SectionHeader,
  type EditSlot,
} from './shared'

export interface ProviderSectionProps {
  providers: SettingsData['providers']
  models: SettingsData['models']
  edit: EditSlot
  confirming: string | null
  onEdit: (slot: EditSlot) => void
  onAskRemove: (key: string) => void
  onCancelConfirm: () => void
  onSave: (index: number | 'new', provider: SettingsData['providers'][number]) => void
  onRemove: (index: number) => void
}

/**
 * 提供商列表 + 编辑表单。
 *
 * 单独成文件是因为它有三种形态（列表 / 新建 / 编辑）在同一处切换；
 * 塞进 ModelsDomain 会让那个文件既管状态又管渲染。
 */
export function ProviderSection(props: ProviderSectionProps) {
  const { providers, models, edit, confirming, onEdit, onAskRemove, onCancelConfirm, onSave, onRemove } =
    props

  return (
    <section className="settings__section">
      <SectionHeader
        title="模型提供商"
        count={providers.length}
        action="+ 新增提供商"
        onAction={() => onEdit('new')}
        disabled={edit !== null}
      />

      {providers.length === 0 && edit === null && (
        <p className="settings__empty">还没有提供商。先添加一个（比如你的网关或本地推理服务）。</p>
      )}

      {edit !== null ? (
        <ProviderEditForm
          initial={edit === 'new' ? null : (providers[edit] ?? null)}
          onSave={(p) => onSave(edit, p)}
          onCancel={() => onEdit(null)}
        />
      ) : (
        <ul className={l.list}>
          {providers.map((p, i) => {
            const key = confirmKey('provider', p.id)
            const count = models.filter((m) => m.providerId === p.id).length
            return (
              <li key={p.id} className={l.row}>
                <div className={l.rowMain}>
                  <span className={l.rowTitle}>{p.name}</span>
                  <code className={l.rowCode}>{p.baseUrl}</code>
                </div>
                <span className={l.badge}>{authLabel(p)}</span>
                {confirming === key ? (
                  <ConfirmBar
                    text={`确认删除？${count > 0 ? `该提供商下有 ${count} 个模型，会一并删除。` : ''}`}
                    onConfirm={() => onRemove(i)}
                    onCancel={onCancelConfirm}
                  />
                ) : (
                  <>
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