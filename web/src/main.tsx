import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installBuiltinClientTools } from './store/clientTools'
import { useShell } from './store/shell'
import { useWorkspaces } from './store/workspaces'
import { restoreLastSession, watchActiveSession } from './store/sessionRestore'
import { bootstrapAppearance } from './components/settings/useSettingsStore'

import './styles/tokens.base.css'
import './styles/tokens.css'
import './styles/base.css'

// 存量全局样式（按拥有者分文件，见 00 号文件 §5 的行数预算）。
// 新组件一律用 CSS Modules，不进这里。
import './styles/controls.css'
import './styles/topbar.css'
import './styles/statusbar.css'
import './styles/dialog.css'
import './styles/workspace-menu.css'
import './styles/workspace-list.css'
import './styles/threadrow.css'
import './styles/sidebar.css'
import './styles/menu.css'

import './styles/chat.css'
import './styles/chat-notices.css'
import './styles/chat-turns.css'
import './styles/chat-usage.css'
import './styles/plan.css'
import './styles/diff.css'
import './styles/card-approval.css'
import './styles/cards-b.css'
import './styles/subagent.css'
// settings.css 随设置中心一起懒加载（见 SettingsDialog.tsx）——它只服务设置域，
// 冷启动不打开设置中心就用不到，留在首屏等于白白多一截 CSS。

/**
 * 启动顺序（每一步都是有意为之，别随手调换）：
 *
 * 1. **先把主题与字号落好，再渲染**。反了的话会先按 CSS 默认值（暗色）
 *    画一帧，亮色主题的用户每次启动都要看到一下闪。配置文件在本地磁盘，
 *    Tauri 调用是毫秒级的，这点等待换掉一帧闪烁很划算（02 §2.4）。
 * 2. **连接排在渲染之后**：先把外壳画出来，再去等后端，避免白屏。
 * 3. **工作区排在连接之后**：工作区决定 cwd，cwd 决定会话列表和右栏资源。
 *
 * 用 async 函数而不是顶层 await：Vite 的默认构建目标（chrome87/es2020）
 * 不支持 TLA，包一层 async 就不必为此把整包目标抬到 esnext。
 */
async function bootstrap(): Promise<void> {
  const container = document.getElementById('root')
  if (!container) throw new Error('#root 不存在')

  // 先登记客户端工具：`item/tool/call` 随时可能到，注册表空了的话
  // codex 点名任何工具都只会得到一句"宿主未实现"。
  installBuiltinClientTools()

  await bootstrapAppearance()

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  // 首屏之后 idle 预取 Markdown 引擎（懒 chunk）：正文渲染要用它，但不必
  // 占首屏。连接 + 工作区 + 恢复会话本来就比它慢，所以用户通常感觉不到加载。
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback
  const warmMarkdown = () => {
    void import('./components/primitives/MarkdownText')
  }
  if (idle) idle(warmMarkdown)
  else setTimeout(warmMarkdown, 200)

  void useShell.getState().connect()
  await whenConnected()
  await useWorkspaces.getState().bootstrap()
  // 工作区与会话列表就位后，把上次打开的会话恢复回来（会话历史本身由
  // codex 持久化，这里补的是壳那枚只活在内存里的当前会话游标）。
  watchActiveSession()
  await restoreLastSession()
}

/**
 * 等连接就绪（最多 30 秒）。
 *
 * 每轮都重新 getState()：返回值是当时的值，缓存进局部变量的话
 * connection 永远不会变，循环会卡在第一次比较上。
 */
const MAX_CONNECT_WAIT_ITERATIONS = 200
const CONNECT_POLL_INTERVAL_MS = 150

async function whenConnected(): Promise<void> {
  for (let i = 0; i < MAX_CONNECT_WAIT_ITERATIONS; i++) {
    if (useShell.getState().connection === 'ready') return
    await new Promise((resolve) => setTimeout(resolve, CONNECT_POLL_INTERVAL_MS))
  }
}

void bootstrap()