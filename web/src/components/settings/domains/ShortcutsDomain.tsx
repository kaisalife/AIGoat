import s from './ShortcutsDomain.module.css'
import { SHORTCUTS } from '../../layout/shortcuts'
import { SettingsField, SettingsSection } from '../../primitives'

/**
 * 快捷键域：一期**只读**参考表。
 *
 * 表来自 `layout/shortcuts.ts` 的注册表，不是另抄一份——两边各写一份的话，
 * 加快捷键的人总会只改一处，然后文档开始骗人。
 *
 * 自定义绑定是二期的事。真正的按键还散在各个组件的 `onKeyDown` 里，
 * 收集齐之前先不摆一个「自定义」的空壳入口。
 */
export function ShortcutsDomain() {
  return (
    <>
      <SettingsSection title="全局快捷键" description="改不了，但至少能找到。">
        {SHORTCUTS.map((spec) => (
          <SettingsField key={spec.id} label={<Kbd keys={spec.keys} />}>
            <span className="dim">{spec.description}</span>
          </SettingsField>
        ))}
      </SettingsSection>

      <SettingsSection title="会话内">
        <SettingsField label={<Kbd keys="Enter" />}>
          <span className="dim">
            发送消息（可在通用域改成 Enter 换行、Ctrl+Enter 发送）
          </span>
        </SettingsField>
        <SettingsField label={<Kbd keys="Esc" />}>
          <span className="dim">关闭当前对话框 / 取消菜单</span>
        </SettingsField>
      </SettingsSection>

      <p className="settings__hint">
        自定义绑定排在后面做：先把散在组件里的按键收进注册表，再谈改键位。
      </p>
    </>
  )
}

/** `Ctrl+B` 拆成两段渲染：修饰键和主键用不同底色，一眼能分清按哪个。 */
function Kbd({ keys }: { keys: string }) {
  const parts = keys.split('+')
  return (
    <span className={s.keys}>
      {parts.map((part, i) => (
        <kbd key={i}>{part}</kbd>
      ))}
    </span>
  )
}