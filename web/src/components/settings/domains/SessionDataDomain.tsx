import { useCallback, useEffect, useState } from 'react'
import s from './SessionDataDomain.module.css'
import { Button, CodeBlock, SettingsField, SettingsSection } from '../../primitives'
import { getClient } from '../../../bridge/session'
import { useShell } from '../../../store/shell'
import { useUi } from '../../../store/ui'
import { useWorkspaces } from '../../../store/workspaces'
import { describe } from '../useModelSettings'

/**
 * 会话数据域：配置目录与三个配置文件。
 *
 * 这一域存在的理由是 00 铁律「配置落盘」——用户需要**看得见**自己的配置
 * 存在哪、里面是什么、怎么改。所以每个文件都配一个「打开位置」，而不是
 * 只丢一句"存在 AppData 里"。
 */
export function SessionDataDomain() {
  const threads = useShell((s) => s.threadList)
  const archived = useShell((s) => s.archivedList)
  const panels = useUi((s) => s.panels)
  const paths = useConfigPaths()

  const liveThreadIds = [...threads, ...archived].map((t) => t.id)

  const prune = useCallback(async () => {
    try {
      await getClient().pruneDock(await collectLiveThreadIds())
      paths.reload()
    } catch (err) {
      // 任何一个工作区读不到就整体放弃：半份「保留集」去清盘会把读不到的
      // 那个工作区的布局一起清掉，那不是「少清一点」，是删用户数据。
      useShell.getState().setHint(`界面布局清理失败，未改动任何布局：${describe(err)}`)
    }
  }, [paths])

  return (
    <>
      <SettingsSection title="配置目录" description="三个配置文件都放在这里，跟着程序走。">
        <SettingsField
          label="settings.json"
          hint="模型提供商、模型目录、通用偏好（主题/字号/密度）。"
        >
          <FileRow
            path={paths.settings}
            onReveal={() => void getClient().revealSettingsFile()}
          />
        </SettingsField>
        <SettingsField label="workspaces.json" hint="已登记的工作区清单与当前工作区。">
          <span className="dim">随工作区增删自动更新</span>
        </SettingsField>
        <SettingsField
          label="ui-state.json"
          hint="三栏列宽、左栏折叠、右栏 dock 布局。拖拽后 500ms 落盘。"
        >
          <FileRow
            path={paths.uiState}
            onReveal={() => void getClient().revealUiStateFile()}
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection
        title="界面状态残留"
        description="右栏布局按会话记在 ui-state.json 的 dock 段里。"
      >
        <SettingsField
          label="已知会话"
          hint={`当前工作区下有 ${liveThreadIds.length} 个会话（未归档 ${threads.length}、已归档 ${archived.length}）。`}
        >
          <Button variant="ghost" onClick={() => void prune()} disabled={liveThreadIds.length === 0}>
            清理已删会话的布局残留
          </Button>
        </SettingsField>
        <SettingsField label="右栏展开区块" hint={`当前展开 ${Object.values(panels).filter(Boolean).length} 个。`}>
          <span className="dim">这一项不落盘：折叠态每次启动回到默认。</span>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="说明" description="为什么不用浏览器的本地存储。">
        <CodeBlock
          code={[
            '配置落盘的两条规则（docs/00 §5）：',
            '',
            '1. 所有配置文件默认写在 exe 旁边。装进 Program Files 之类',
            '   不可写的目录时，才回落到 %APPDATA%\\dev.aigoat.app\\ 并迁移。',
            '',
            '2. 前端持久化一律走配置文件，不用 localStorage——',
            '   WebView 的 localStorage 落在 C 盘 AppData，用户找不到、',
            '   备份不了，还和另外两个配置文件各散一处。',
          ].join('\n')}
        />
      </SettingsSection>
    </>
  )
}

/**
 * 全部存活会话的 id（跨工作区）。
 *
 * dock 布局是**全局按 threadId** 记在 ui-state.json 里的，而每张会话列表只
 * 覆盖当前工作区——只拿当前工作区当「保留集」去清，会把别的目录的布局一起
 * 清掉。所以这里按登记过的工作区逐个查（含归档）；任何一个查不到就抛错，
 * 调用方整体放弃，宁可少清也不错清。
 */
async function collectLiveThreadIds(): Promise<string[]> {
  const client = getClient()
  const cwds = new Set<string>()
  const active = useShell.getState().cwd
  if (active) cwds.add(active)
  for (const w of useWorkspaces.getState().list) cwds.add(w.path)
  const ids = new Set<string>()
  for (const cwd of cwds) {
    const [live, archived] = await Promise.all([
      client.listThreads({ cwd }),
      client.listThreads({ cwd, archived: true }),
    ])
    for (const t of [...live, ...archived]) ids.add(t.id)
  }
  return [...ids]
}

function FileRow({ path, onReveal }: { path: string; onReveal: () => void }) {
  return (
    <span className={s.row}>
      <code title={path}>{path || '（读不到）'}</code>
      <Button variant="ghost" onClick={onReveal}>
        打开位置
      </Button>
    </span>
  )
}

interface ConfigPaths {
  settings: string
  uiState: string
  reload: () => void
}

/** 两个路径都来自 `bridge_settings_get`，一次调用拿齐，不额外加命令。 */
function useConfigPaths(): ConfigPaths {
  const [paths, setPaths] = useState({ settings: '', uiState: '' })
  const reload = useCallback(() => {
    void getClient()
      .getSettings()
      .then((payload) =>
        setPaths({ settings: payload.configPath, uiState: payload.uiStatePath }),
      )
      // 读不到路径不是错误，只是这一域展示不出位置：如实说，别假装有。
      .catch((err) => setPaths({ settings: describe(err), uiState: '' }))
  }, [])

  useEffect(reload, [reload])
  return { ...paths, reload }
}