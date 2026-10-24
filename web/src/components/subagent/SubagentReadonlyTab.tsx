import { useMemo, useState } from 'react'
import { ConversationStream } from '../chat/ConversationStream'
import { Button } from '../primitives'
import { getClient } from '../../bridge/session'
import { getWatchedThread } from '../../store/subagents'
import { useShell } from '../../store/shell'
import { emptyTurnState, type TurnState } from '../../store/turnState'
import s from './SubagentReadonlyTab.module.css'

/**
 * 子代理只读 tab（09 号板块 §4.2，抄 dsh 的「子会话只读 tab」）。
 *
 * # 数据来自快照，不是账本回放
 *
 * `store.snapshots` 存着**每个非当前线程的实时消息流**（ingest 按 threadId
 * 分流时落的）。所以这个 tab 是活的：子代理还在跑，内容就跟着更新。
 * 从账本回放也凑得出内容，但那是"重建"而非"实时"，而且要重新实现一遍
 * 归组与回合切分。
 *
 * # 只读：没有输入区，没有审批按钮
 *
 * 子代理在别人的线程里，向它发消息要么被协议拒绝、要么产生一个用户在
 * 这里看不见的回合。所以只给"看"和两个动作：**续问**（fork 出新会话）
 * 与**停止**（interrupt 那个线程）。
 */
export function SubagentReadonlyTab() {
  const threadId = getWatchedThread()
  const snapshots = useShell((s) => s.snapshots)
  const activeThreadId = useShell((s) => s.activeThreadId)
  const [busy, setBusy] = useState(false)

  const turn: TurnState = useMemo(
    () => (threadId ? (snapshots.get(threadId) ?? emptyTurnState()) : emptyTurnState()),
    [snapshots, threadId],
  )

  if (!threadId) {
    return (
      <div className={s.pane}>
        <p className={s.empty}>
          在会话头的「子代理」面包屑里点一个子代理，即可在这里看它的实时事件流。
        </p>
      </div>
    )
  }

  if (threadId === activeThreadId) {
    return (
      <div className={s.pane}>
        <p className={s.empty}>这就是当前会话——它已经在中栏显示着了。</p>
      </div>
    )
  }

  return (
    <div className={s.pane}>
      <header className={s.head}>
        <code className={s.id} title={threadId}>
          {threadId}
        </code>
        <span className="spacer" />
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || !turn.turnId}
          onClick={() => void stopThread(threadId, turn.turnId ?? '', setBusy)}
          title="停止这个子代理的当前回合"
        >
          停止
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void continueThread(threadId, setBusy)}
          title="fork 出一个新会话，从那里接着聊"
        >
          续问
        </Button>
      </header>

      {turn.entries.length === 0 ? (
        <p className={s.empty}>
          这个子代理还没有产出内容。
          <br />
          它的实时事件会出现在这里（当前保留最近 5 个线程的快照）。
        </p>
      ) : (
        // 复用会话视图的组件树：归组、渲染、滚动所有权都在那儿。
        // 重写一份只读版必然与主视图漂移。
        <ConversationStream
          entries={turn.entries}
          turns={turn.turns}
          turnActive={turn.turnActive}
          resetKey={threadId}
          readonly
        />
      )}
    </div>
  )
}

/**
 * 停止：interrupt **那个线程**的当前回合。
 *
 * 用客户端的 `interrupt(threadId, turnId)` 而不是 `bridge_interrupt`——
 * 后者不带参数，interrupt 的是**当前会话**，会把主会话也一起停掉。
 */
async function stopThread(
  threadId: string,
  turnId: string,
  setBusy: (busy: boolean) => void,
): Promise<void> {
  setBusy(true)
  try {
    await getClient().interrupt(threadId, turnId)
  } catch {
    // 停不下来不算致命：子代理自己也会结束，只是慢一点。
  } finally {
    setBusy(false)
  }
}

/** 续问：fork 出新会话并切过去——从那里接着聊。 */
async function continueThread(threadId: string, setBusy: (busy: boolean) => void): Promise<void> {
  setBusy(true)
  try {
    const forked = await getClient().forkThread(threadId)
    await useShell.getState().resumeThread(forked.id)
  } catch {
    // 续问失败就留在只读视图：用户还能看，不至于什么都丢了。
  } finally {
    setBusy(false)
  }
}