import { lazy, Suspense } from 'react'
import { ChatView } from '../chat/ChatView'
import { WelcomeView } from '../chat/WelcomeView'
import { useLayoutStore } from './useLayoutStore'
import { useShell } from '../../store/shell'
import { useWorkspaces } from '../../store/workspaces'

// 事件回放是中栏的第二个视图，默认不显示——按需加载，冷启动不背它的代码。
const TrajectoryView = lazy(() =>
  import('../trajectory/TrajectoryView').then((m) => ({ default: m.TrajectoryView })),
)

/**
 * 中栏槽：决定这一栏此刻显示什么。
 *
 * 判定顺序有意如此：
 * 1. 没有工作区 → 引导打开工作区（此时就算切到事件回放也没有东西可放）
 * 2. 视图环 → 会话投影 / 事件回放投影（01 §2.1）
 *
 * 加第三种视图时只改第 2 步，不碰 AppFrame 也不碰 App。
 *
 * 订阅逐字段选，**不整店取**：`ChatView` 自己订阅它需要的切片，这里只决定
 * 「显示哪个视图」。整店订阅会让中栏在每条流式 delta 上跟着重渲染。
 */
export function CenterSlot() {
  const cwd = useShell((s) => s.cwd)
  const activeThreadId = useShell((s) => s.activeThreadId)
  const view = useLayoutStore((s) => s.mainView)
  const loading = useWorkspaces((s) => s.loading)
  const pick = useWorkspaces((s) => s.pick)

  if (!cwd && !activeThreadId) {
    return <WelcomeView busy={loading} onOpenWorkspace={() => void pick()} />
  }
  return view === 'trajectory' ? (
    <Suspense fallback={null}>
      <TrajectoryView />
    </Suspense>
  ) : (
    <ChatView />
  )
}
