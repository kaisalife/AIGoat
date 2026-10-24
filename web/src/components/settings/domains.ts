/**
 * 设置域清单。
 *
 * 只有五个，别扩。dsh 的插件域、账号域都不抄（18-排除清单）——
 * 一个装不进两三个设置项的域只是在导航里占一行。
 *
 * 清单单独成文件：`SettingsDialog` 负责路由、`SettingsNav` 负责渲染，
 * 两者都要它。放在任何一边都会变成从对话框反向 import 导航的环。
 */
export type DomainId = 'general' | 'models' | 'subagents' | 'session-data' | 'shortcuts'

export const SETTINGS_DOMAINS: { id: DomainId; label: string }[] = [
  { id: 'general', label: '通用' },
  { id: 'models', label: '模型' },
  { id: 'subagents', label: '子 Agent' },
  { id: 'session-data', label: '会话数据' },
  { id: 'shortcuts', label: '快捷键' },
]

export function domainLabel(id: DomainId): string {
  return SETTINGS_DOMAINS.find((d) => d.id === id)?.label ?? '设置'
}