/**
 * 会话的**破坏性 / 结构变更**操作：fork 与 revert。
 *
 * 与 `threadOps.ts` 分开是因为这两个各自有一段"必须说清后果"的注释，
 * 而它们周围全是日常的增删改查——混在一起会让那两段警告被淹没。
 */

import { getClient } from '../../bridge/session'
import { emptyTurnState } from '../turnState'
import { guard, type GetShell, type SetShell } from './types'

/** fork 出新会话并切过去。fork **不带历史**，所以紧接着恢复一次。 */
export async function forkThread(set: SetShell, get: GetShell, id: string): Promise<void> {
  await guard(set, 'fork 会话', async () => {
    const forked = await getClient().forkThread(id)
    const fresh = {
      id: forked.id,
      preview: forked.preview ?? '（fork）',
      updatedAt: Date.now(),
      model: forked.model,
      status: forked.status,
    }
    const s = get()
    set({
      threadList: [fresh, ...s.threadList],
      activeThreadId: forked.id,
      turn: emptyTurnState(),
      currentTurnId: null,
      turnStatus: null,
    })
    // 恢复是另一次调用：让新会话把历史回放进来（fork 本身不带）。
    await get().resumeThread(forked.id)
  })
}

/**
 * 回滚到某一回之前。
 *
 * 回滚只改**对话历史**，本地文件不动——所以完成提示必须说清这一点，
 * 否则用户会以为代码也退回去了。
 */
export async function revert(
  set: SetShell,
  get: GetShell,
  id: string,
  beforeTurnId: string,
): Promise<void> {
  await guard(set, '回滚会话', async () => {
    await getClient().threadRevert(id, beforeTurnId)
    // 历史变了，本地那份投影也得换掉——否则消息流里还留着被回滚的回合。
    await get().resumeThread(id)
    set({ hint: '已回滚到该回合之前。对话历史被替换了，**本地文件改动没有回滚**。' })
  })
}