import type { ProviderConfig } from '../../bridge/client'

/** codex 保留的 provider id：用作自定义 provider 会被拒绝。 */
export const RESERVED_PROVIDER_IDS = [
  'openai',
  'amazon-bedrock',
  'amazon-bedrock-runtime',
  'ollama',
  'lmstudio',
]

/** 与 settings.rs 的 `UiSettings::default()` 一一对应，别单边改。 */
export const DEFAULT_UI_PREFS = {
  theme: 'light',
  contentSize: 14,
  density: 'comfortable',
  enterSends: true,
  defaultPermissionProfile: null,
} as const

export type AuthMode = 'env' | 'local' | 'none'

/** 一个提供商当前的鉴权方式。列表上那个徽标就是它。 */
export function authModeOf(p: ProviderConfig): AuthMode {
  // 壳不下发明文 Key（读取时 apiKey 为 null），本地存过 Key 的用 hasApiKey 判断。
  if (p.hasApiKey || p.apiKey?.trim()) return 'local'
  if (p.envKey?.trim()) return 'env'
  return 'none'
}

export function authLabel(p: ProviderConfig): string {
  switch (authModeOf(p)) {
    case 'env':
      return `环境变量 ${p.envKey}`
    case 'local':
      return 'Key 存本机'
    default:
      return '无鉴权'
  }
}