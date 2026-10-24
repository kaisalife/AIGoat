import { useState } from 'react'
import { Modal } from '../primitives'
import { SettingsNav } from './SettingsNav'
import { domainLabel, SETTINGS_DOMAINS, type DomainId } from './domains'
import { GeneralDomain } from './domains/GeneralDomain'
import { ModelsDomain } from './domains/ModelsDomain'
import { SessionDataDomain } from './domains/SessionDataDomain'
import { ShortcutsDomain } from './domains/ShortcutsDomain'
import { SubagentsDomain } from './domains/SubagentsDomain'
import s from './SettingsDialog.module.css'
// 跨域共用的设置样式随本组件一起懒加载（不再进 main.tsx 首屏）：它只服务
// 设置域，冷启动不打开设置中心就用不到。见 main.tsx 的同名说明。
import '../../styles/settings.css'

/**
 * 设置中心（dsh 的域基座：模态 + 左导航）。
 *
 * 800×800 模态，左侧域导航、右侧域内容滚动。模态尺寸在这里而不是各域里，
 * 是为了让所有域共享同一块画布——域只管自己的内容。
 *
 * 各域自己管自己的状态与提交：模型域改完要重启连接、通用域改一下就生效，
 * 强行统一成一种交互只会两边都不顺手（见 docs/15 §3.2）。
 */
export function SettingsDialog(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props
  const [active, setActive] = useState<DomainId>('models')

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      title="设置"
      description="模型、子 Agent 与界面偏好。改动各自即时生效。"
      className={s.modal}
      bodyClassName={s.body}
    >
      <SettingsNav domains={SETTINGS_DOMAINS} active={active} onSelect={setActive} />
      <div className={s.content} role="tabpanel" aria-label={domainLabel(active)}>
        <DomainBody id={active} />
      </div>
    </Modal>
  )
}

/**
 * 域路由。
 *
 * 用 switch 而不是对象字典：每个域是独立的 React 组件（各自持有自己的
 * hook 状态），字典每次渲染都会重建组件类型，导致所有域的局部状态每帧丢失。
 * switch 保持组件身份稳定，来回切域时草稿还在。
 */
function DomainBody({ id }: { id: DomainId }) {
  switch (id) {
    case 'general':
      return <GeneralDomain />
    case 'models':
      return <ModelsDomain />
    case 'subagents':
      return <SubagentsDomain />
    case 'session-data':
      return <SessionDataDomain />
    case 'shortcuts':
      return <ShortcutsDomain />
  }
}