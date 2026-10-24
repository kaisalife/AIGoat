/**
 * 子代理的父子关系（09 号板块）。
 *
 * # 数据从账本来
 *
 * `subAgentActivity` 事件带 `agentThreadId` + `agentPath`（C 期已映射），
 * 并且已经进了事件账本（06）。所以血缘树是**算出来的**，不是另外维护的
 * 一份状态——再维护一份的话两边迟早对不上，而"对不上"在这里意味着
 * 面板指着一个不存在的线程。
 *
 * # 为什么不需要新命令
 *
 * 09 号文件 §3 的结论是"复用 agent-event 按 threadId 分流"。事件已经带
 * 线程上下文，前端路由即可。**不接 `bridge_subscribe`**。
 *
 * # 父节点靠路径前缀认，不靠 parent 字段
 *
 * 协议**没有**单独的 parent id，只有层级化的 `agentPath`（`root/a/b`）。
 * 而线程 id 是 uuid，和路径末段对不上。所以父 = "路径是本节点路径的最长
 * 真前缀的那个节点"。认不出来就当根：宁可显示成顶层，也不要挂错人。
 */

import { useMemo } from 'react'
import { useSubAgentRows } from './ledger'

export interface SubAgentNode {
  threadId: string
  /** 事件里给的路径，形如 `root/child/grandchild`。 */
  path: string
  activity: string
  children: SubAgentNode[]
  running: boolean
}

interface ActivityRow {
  kind: string
  turnId: string | null
  payload: unknown
}

/**
 * 从账本算出当前会话的子代理树。
 *
 * 只取**出现过子代理活动**的线程：没有活动的线程对用户没有意义，
 * 全量 `thread/list` 里那些只是被 fork 过的旧分支不该出现在血缘里。
 */
export function useSubAgentTree(threadId: string | null): SubAgentNode[] {
  // 只订阅子代理活动子索引：血缘面包屑常驻会话头，订阅全量账本行会让每条
  // delta 都重建一次树。
  const rows = useSubAgentRows(threadId)
  return useMemo(() => buildTree(rows), [rows])
}

/** 从账本行建树。导出以便离线校验。 */
export function buildTree(rows: ActivityRow[]): SubAgentNode[] {
  const byThread = new Map<string, SubAgentNode>()

  for (const row of rows) {
    if (row.kind !== 'subAgentActivity') continue
    const activity = asRecord(row.payload)
    const agentThreadId = asString(activity['agentThreadId'])
    if (!agentThreadId) continue

    const existing = byThread.get(agentThreadId)
    const kind = asString(activity['kind']) ?? 'started'
    if (existing) {
      // 同一子线程的多次活动（started → interacted → completed）合成一个节点：
      // 用户关心的是"这个子代理"，不是它的每一次心跳。
      existing.activity = kind
      existing.running = !isTerminal(kind)
      continue
    }
    byThread.set(agentThreadId, {
      threadId: agentThreadId,
      path: asString(activity['agentPath']) ?? agentThreadId,
      activity: kind,
      children: [],
      running: !isTerminal(kind),
    })
  }

  const nodes = [...byThread.values()]
  // 先按路径深度排序：父一定比子浅，接边时才不会遇到"父还没建立"的情况。
  nodes.sort((a, b) => depth(a.path) - depth(b.path))

  const roots: SubAgentNode[] = []
  for (const node of nodes) {
    const parent = findParent(nodes, node)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** 路径最长真前缀对应的那个节点。 */
function findParent(nodes: SubAgentNode[], node: SubAgentNode): SubAgentNode | null {
  let best: SubAgentNode | null = null
  let bestDepth = -1
  const ownDepth = depth(node.path)
  for (const candidate of nodes) {
    if (candidate === node) continue
    const d = depth(candidate.path)
    if (d >= ownDepth) continue
    if (!isAncestorPath(candidate.path, node.path)) continue
    if (d > bestDepth) {
      best = candidate
      bestDepth = d
    }
  }
  return best
}

function isAncestorPath(ancestor: string, node: string): boolean {
  return node === ancestor ? false : node.startsWith(`${ancestor}/`)
}

function depth(path: string): number {
  return path.split('/').filter(Boolean).length
}

/** 终态活动名。这些之后子代理不再活动。 */
function isTerminal(activity: string): boolean {
  return activity === 'completed' || activity === 'interrupted'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/** 树的叶子数——"派了几个子代理"是用户最常问的问题。 */
export function countNodes(nodes: SubAgentNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0)
}

/**
 * 只读面板当前正在看哪个子线程。
 *
 * 用一个模块级变量而不是 store：面板类型是单例（09 号文件 §4.2），
 * 而打开它的入口有好几个（面包屑、消息流徽章），传参链路会长得难看。
 *
 * 放 store 反而更糟——为一个"UI 指针"建一份全局状态，它会在切会话时
 * 变成一个需要清理的脏数据源。
 */
let watchedThreadId: string | null = null

export function setWatchedThread(threadId: string | null): void {
  watchedThreadId = threadId
}

export function getWatchedThread(): string | null {
  return watchedThreadId
}