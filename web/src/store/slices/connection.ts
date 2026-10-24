/**
 * 连接与模型配置。
 *
 * 与线程/回合分开，是因为这一块的生命周期完全不同：它只在启动时跑一次，
 * 之后基本只读。放进回合分片会让那个文件一半代码是启动逻辑。
 */

import { getClient } from '../../bridge/session'
import { recordToLedger } from '../ledger'
import { useResources } from '../resources'
import { reattachOrphans } from '../terminalReattach'
import type { AnyEvent, ConnectInfo } from '../../bridge/types'
import type { ShellState } from '../shell'
import type { Slice } from './types'

export const connectionSlice: Slice<
  Pick<
    ShellState,
    | 'connection'
    | 'userAgent'
    | 'cwd'
    | 'modelId'
    | 'settings'
    | 'needsSetup'
    | 'models'
    | 'contextWindow'
    | 'hint'
    | 'connect'
  | 'reconnect'
    | 'setModel'
    | 'setHint'
    | 'modelOptions'
  >
> = (set, get) => ({
  connection: 'disconnected',
  userAgent: '',
  cwd: '',
  modelId: '',
  settings: null,
  needsSetup: false,
  models: [],
  contextWindow: 0,
  hint: null,

  async connect() {
    const client = getClient()
    set({ connection: 'connecting', hint: '正在连接 app-server…' })
    try {
      const info: ConnectInfo = await client.connect()
      // 一源双投（06 号板块 §3.1）：账本先收，再进 reducer 长成条目。
      // 顺序不能反——reducer 抛异常时账本仍要完整，那是排查问题的第一手材料。
      client.subscribe((event) => {
        recordToLedger(event as AnyEvent)
        get().ingest(event)
      })

      // 会话列表不在这里拉：cwd 要等工作区读到才知道，先拉会闪一下
      // "全量会话"。工作区由 useWorkspaces.bootstrap() 接手。
      const payload = await client.getSettings()
      const catalog = payload.settings.models
      const models = catalog.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        isDefault: m.isDefault,
      }))
      // 选中项：配置里的 active → 标了默认的 → 列表第一个。内置目录永不参与。
      const active =
        catalog.find((m) => m.id === payload.settings.activeModelId) ??
        catalog.find((m) => m.isDefault) ??
        catalog[0]

      set({
        connection: 'ready',
        userAgent: info.userAgent,
        settings: payload.settings,
        needsSetup: catalog.length === 0,
        models,
        modelId: active?.id ?? '',
        contextWindow: active?.contextWindow ?? 0,
hint: catalog.length
          ? null
          : '尚未配置模型：点击右上角设置，添加你的模型提供商与模型。',
      })

      // 连接就绪后立刻把孤立终端挂回显示（10 号文件 §4.1）。
      //
      // 位置就在 `ready` 之后：清单要问 codex 那边，没连上问不到。
      // 不 await：终端显示是增强功能，绝不能拖住「连接完成」这件事，
      // 它自己 catch 掉所有错误。
      void reattachOrphans()
    } catch (err) {
      set({
        connection: 'error',
        hint: `连接失败：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  },

  /**
 * 重连：重新拉起 codex → 重列会话 → 换掉当前会话的基线。
 *
 * # 为什么必须换基线
 *
 * 断线期间发生的一切，事件流里**永远不会有**——订阅断了就是断了，
 * 补不回来。不换基线的后果不是"少几条日志"，而是消息流与账本都在
 * **说谎**：它们呈现的是一段被截断的历史，而用户以为那就是全部。
 *
 * 顺带把工作区重读一遍：工作区列表也是可能在我们断线时变过的。
 *
 * # 为什么暴露成手动 + 自动各一条路
 *
 * - 手动：状态栏的「重新连接」按钮，用户知道发生了什么
 * - 自动：下一次命令失败时补跑一次（见 `shell/send` 里的 catch）
 */
async reconnect() {
      const s = get()
      set({ connection: 'connecting', hint: '正在重新连接…' })
      try {
        await s.connect()
        // connect() 成功后再谈历史：顺序反了会用旧连接去拉，必然失败。
        await get().refreshThreads()
        const threadId = get().activeThreadId
        if (threadId) {
          await get().resyncBaseline()
          await get().loadGoal()
        }
        await useResources.getState().load(get().cwd)
        set({ hint: '已重新连接，历史已按服务端基线校准。' })
      } catch (err) {
        set({
          connection: 'error',
          hint: `重新连接失败：${err instanceof Error ? err.message : String(err)}`,
        })
      }
    },

  setModel(id) {
    const model = get().settings?.models.find((m) => m.id === id)
    set({ modelId: id, contextWindow: model?.contextWindow ?? 0 })
    // 持久化选中项；失败不静默，但也别打断界面。
    void getClient()
      .setActiveModel(id)
      .catch((err) => set({ hint: `保存模型选择失败：${err instanceof Error ? err.message : String(err)}` }))
  },

  setHint(hint) {
    set({ hint })
  },

  modelOptions() {
    return get().models
  },
})