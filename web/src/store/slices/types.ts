/**
 * store 分片的公共类型。
 *
 * 整个 shell 是一个 store（组件侧只用 `useShell` 一个入口），但实现按
 * 连接 / 线程 / 回合三块分开写。单入口是因为组件到处都在用 `useShell`，
 * 拆成三个 store 就得在每个组件里订阅三份、还得自己处理它们之间的
 * 一致性；拆实现是因为一个文件塞不下，而且三块会各自长。
 */

import type { ShellState } from '../shell'

export type SetShell = (
  partial: Partial<ShellState> | ((state: ShellState) => Partial<ShellState>),
) => void

export type GetShell = () => ShellState

/** 一个分片：拿到 set/get，返回自己负责的那部分状态与动作。 */
export type Slice<T> = (set: SetShell, get: GetShell) => T

/**
 * 回合分片负责的那部分 `ShellState`。
 *
 * 单独起名而不是内联 `Pick<...>`：内联那三十行 key 每加一个字段都要改两处
 * （key 列表 + 实现），而编译器只能检查其中一处。起名之后 `Slice<TurnsKeys>`
 * 一处就够——少一个 key 会直接编译失败。
 */
/** 会话分片负责的键（`threadOps` 里是实现，这里只有类型）。 */
export type ThreadsKeys = Pick<
  ShellState,
  | 'threadList'
  | 'archivedList'
  | 'activeThreadId'
  | 'pinnedThreads'
  | 'threadOrder'
  | 'newThread'
  | 'resumeThread'
  | 'archiveThread'
  | 'unarchiveThread'
  | 'deleteThread'
  | 'deleteThreads'
  | 'renameThread'
  | 'compactThread'
  | 'clearTurn'
  | 'refreshThreads'
  | 'setWorkspace'
  | 'forgetThreads'
  | 'threads'
> &
  ThreadExtraKeys

export type TurnsKeys = Pick<
  ShellState,
  | 'turn'
  | 'currentTurnId'
  | 'turnStatus'
  | 'turnStartedAt'
  | 'elapsedMs'
  | 'tokens'
  | 'goal'
  | 'loadGoal'
  /** 拉服务端基线替换整个回合态（重连后用）。 */
  | 'resyncBaseline'
  /** 发起压缩（乐观插入进行中态）。 */
  | 'compact'
  | 'dismissCompactionNotice'
  /** 非当前线程的消息流快照（09 号板块）。 */
  | 'snapshots'
  | 'snapshotClock'
  | 'ingest'
  | 'send'
  | 'interrupt'
  | 'answerApproval'
  | 'answerUserInput'
  | 'answerElicitation'
  | 'busy'
  | 'pendingApprovals'
  | 'pendingQuestions'
>

/** 会话列表增强要用的键（03 号文件）：置顶、手工排序、fork、回滚。 */
export type ThreadExtraKeys = Pick<
  ShellState,
  | 'pinnedThreads'
  | 'threadOrder'
  | 'togglePin'
  | 'reorderById'
  | 'fork'
  | 'revert'
>

/** 回合操作失败时把原因放到提示行，不静默吞掉。 */
export async function guard(
  set: SetShell,
  what: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn()
  } catch (err) {
    set({ hint: `${what}失败：${err instanceof Error ? err.message : String(err)}` })
  }
}

export function elapsed(startedAt: number | null): number | null {
  return startedAt ? Date.now() - startedAt : null
}

export function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * 建会话 / 发消息的前置检查。
 *
 * 返回一段提示文案表示被拦下了——调用方直接 return 掉，别继续往下走。
 * 这两个前置条件（配了模型、打开了工作区）缺一不可，而它们在两个分片里
 * 都要查，所以共用一份。
 */
export function requireModelAndCwd(
  set: (partial: { hint: string }) => void,
  s: Pick<ShellState, 'modelId' | 'cwd'>,
): string | null {
  if (!s.modelId) {
    const hint = '尚未配置模型：请先打开右上角设置添加模型。'
    set({ hint })
    return hint
  }
  if (!s.cwd) {
    const hint = '还没有打开工作区：请先在顶栏选一个文件夹。'
    set({ hint })
    return hint
  }
  return null
}