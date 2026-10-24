import { create } from 'zustand'
import { useEffect, useState } from 'react'
import { getClient } from '../../bridge/session'
import type { UiPrefs } from '../../bridge/client'

/** 内容字号档的范围（dsh 同款 10–22）。 */
export const CONTENT_SIZE_MIN = 10
export const CONTENT_SIZE_MAX = 22

export interface UiPrefsState extends UiPrefs {
  /** 是否已从 settings.json 读回真实值。false 时界面用的是默认值。 */
  ready: boolean
  load: () => Promise<void>
  update: (patch: Partial<UiPrefs>) => void
}

/**
 * 通用偏好（主题 / 内容字号 / 密度 / 发送行为 / 默认权限档位）。
 *
 * 落盘在 `settings.json` 的 `ui` 段——与模型配置同一个文件，都属于
 * 「跟着账号走、改了不用重启」。布局与右栏 dock 不在这里，见 useLayoutStore。
 *
 * **不用 localStorage**（00 铁律「配置落盘」）：WebView 的存储落 C 盘
 * AppData，用户既找不到也没法备份，和其他配置文件各散各处。
 */

/**
 * 必须在 store 之前声明。
 *
 * `create()` 会**同步**执行初始化函数，那一刻就在读 `DEFAULTS`——写在
 * 后面的话是暂时性死区（TDZ），模块一被求值就抛
 * `ReferenceError: Cannot access 'DEFAULTS' before initialization`。
 * 这不是理论问题：单测里第一次跑出来就是这个错，而它在浏览器里同样会炸
 * （只是这个应用还没被真正启动过，所以没人先撞上）。
 */
const DEFAULTS: UiPrefs = {
  theme: 'light',
  contentSize: 14,
  density: 'comfortable',
  enterSends: true,
  defaultPermissionProfile: null,
}

export const useSettingsStore = create<UiPrefsState>()((set, get) => ({
  ...DEFAULTS,
  ready: false,

  async load() {
    try {
      const payload = await getClient().getSettings()
      const prefs = normalize(payload.settings.ui)
      set({ ...prefs, ready: true })
      applyAppearance(prefs)
    } catch {
      // 配置读不到也要把界面画出来：用默认值，只是不落盘。
      set({ ready: true })
      applyAppearance(pick(get()))
    }
  },

  update(patch) {
    const prefs = normalize({ ...pick(get()), ...patch })
    set(prefs)
    applyAppearance(prefs)
    void getClient()
      .setUiPrefs(prefs)
      .catch((err) => console.error('[settings] 保存偏好失败:', err))
  },
}))

function pick(s: UiPrefsState): UiPrefs {
  return {
    theme: s.theme,
    contentSize: s.contentSize,
    density: s.density,
    enterSends: s.enterSends,
    defaultPermissionProfile: s.defaultPermissionProfile,
  }
}

/** 钳制越界值：手写的 settings.json 也该把界面撑得住。 */
function normalize(raw: Partial<UiPrefs> | undefined): UiPrefs {
  const theme = raw?.theme
  const density = raw?.density
  const size = Number(raw?.contentSize ?? DEFAULTS.contentSize)
  return {
    theme: theme === 'dark' || theme === 'system' ? theme : 'light',
    density: density === 'compact' ? 'compact' : 'comfortable',
    contentSize: Number.isFinite(size)
      ? Math.min(CONTENT_SIZE_MAX, Math.max(CONTENT_SIZE_MIN, Math.round(size)))
      : DEFAULTS.contentSize,
    enterSends: raw?.enterSends ?? DEFAULTS.enterSends,
    defaultPermissionProfile: raw?.defaultPermissionProfile ?? null,
  }
}

/**
 * 把偏好写进 `<html>` 的 data 属性与 CSS 变量，token 层据此切换。
 *
 * `system` 在这里**解析成具体的 light/dark** 再写 `data-theme`：
 * token 层因此不必写媒体查询分支，也就不会出现「显式亮色被系统深色覆盖」
 * 这类两层打架。原始偏好另存 `data-theme-pref`，设置中心还要显示它。
 */
export function applyAppearance(prefs: UiPrefs): void {
  const root = document.documentElement
  root.dataset['theme'] = resolveTheme(prefs.theme)
  root.dataset['themePref'] = prefs.theme
  root.dataset['density'] = prefs.density
  root.style.setProperty('--ag-content-size', String(prefs.contentSize))
}

export function resolveTheme(theme: UiPrefs['theme']): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * 订阅生效后的主题。
 *
 * 偏好是 `system` 时要跟着**系统**切换而变，所以这里挂了一个 media query
 * 监听——只在偏好真的是 system 时才挂，选了 light/dark 的用户不为一个
 * 永不变化的监听器付出代价。
 */
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useSettingsStore((s) => s.theme)
  const system = useSystemDark()
  if (theme !== 'system') return theme
  return system ? 'dark' : 'light'
}

function useSystemDark(): boolean {
  const [dark, setDark] = useState(
    () => !window.matchMedia?.('(prefers-color-scheme: light)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setDark(!query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return dark
}

/**
 * 首屏引导：读回偏好并落到 `<html>`，再让调用方渲染。
 *
 * 必须在 render 之前 await 一次——否则会先按 CSS 默认（暗色）画一帧，
 * 亮色主题的用户每次启动都看到一下闪。配置文件在本地磁盘，Tauri 调用
 * 是毫秒级的，这点等待换掉一帧闪烁很划算。
 *
 * 加超时兜底：桥不可用时照样渲染，只是停在默认值。
 */
export async function bootstrapAppearance(timeoutMs = 400): Promise<void> {
  const store = useSettingsStore.getState()
  try {
    await withTimeout(store.load(), timeoutMs)
  } catch {
    applyAppearance(pick(useSettingsStore.getState()))
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('读取偏好超时')), ms)
    work.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}