/**
 * 条目 → 渲染节点树。
 *
 * 三层折叠做在这里，**不在组件里**（04 §3.2）：
 * 1. 回合（TurnBlock）
 * 2. 过程组（ProcessGroup）——同一回合里连续的推理/工具/文件变更
 * 3. 条目（条目之间还有一层 `childOf` 嵌套，见 05 §3.2）
 *
 * 归组在渲染边界一次算完（`useMemo`），组件只读快照。这样「哪些条目
 * 归一组」这条规则只有一处实现，改组件不会顺手改掉归组逻辑。
 */

import { useMemo, useRef } from 'react'
import { groupSummary } from '../components/cards/summaries'
import { isProcessEntry, type Entry, type ProcessEntry } from './entries'
import type { TurnMeta } from './turnState'

/** 一个渲染节点。两种形态的差别只在于「怎么算标题」，子树结构一致。 */
export type ChatNode = EntryNode | GroupNode

export type EntryNode = { type: 'entry'; entry: Entry; depth: number; children: ChatNode[] }
export type GroupNode = {
  type: 'group'
  id: string
  summary: string
  running: boolean
  depth: number
  children: ChatNode[]
}

/** 一个回合的渲染块。 */
export interface TurnBlock {
  meta: TurnMeta
  nodes: ChatNode[]
}

/**
 * 归组阈值：连续几条过程条目才值得套一层折叠壳。
 *
 * 一条工具调用自己就看得懂，套壳只是多点一次。两条以上才形成「过程」，
 * 这也正是 dsh 折叠的那部分。
 */
const GROUP_MIN = 2

/** 嵌套树的缩进上限。超过三层的调用关系人脑也读不动了。 */
export const MAX_TREE_DEPTH = 3

/**
 * 按回合切块，并把每块内部的过程条目归组。
 *
 * 条目用 `entry.turn` 分组而不是数组下标——本地回显的消息插在
 * `turnStarted` 之前，用下标切会把它切进上一回合。
 */
export function buildTurnBlocks(entries: Entry[], turns: TurnMeta[]): TurnBlock[] {
  const byTurn = entriesByTurn(entries)

  // 元信息建一次索引：下面的循环每个回合块都要查一次，用 `turns.find` 是
  // O(回合数²)，流式时每个 delta 都会整段重算。
  const metaByIndex = new Map<number, TurnMeta>()
  for (const meta of turns) metaByIndex.set(meta.index, meta)

  const indices = blockIndices(byTurn, turns)

  return indices.map((index) => ({
    meta: metaByIndex.get(index) ?? defaultMeta(index),
    nodes: groupProcesses(byTurn.get(index) ?? []),
  }))
}

/** 条目按 `entry.turn` 分桶。分桶规则只此一处。 */
function entriesByTurn(entries: Entry[]): Map<number, Entry[]> {
  const byTurn = new Map<number, Entry[]>()
  for (const entry of entries) {
    const bucket = byTurn.get(entry.turn)
    if (bucket) bucket.push(entry)
    else byTurn.set(entry.turn, [entry])
  }
  return byTurn
}

/** 回合下标的并集（有条目的 ∪ 有元信息的），升序。 */
function blockIndices(byTurn: Map<number, Entry[]>, turns: TurnMeta[]): number[] {
  return [...new Set([...byTurn.keys(), ...turns.map((t) => t.index)])].sort((a, b) => a - b)
}

/** 没有元信息时的占位（上游还没发这一回的 turnStarted）。 */
function defaultMeta(index: number): TurnMeta {
  return {
    index,
    turnId: null,
    startedAt: 0,
    endedAt: null,
    status: 'pending',
    preview: '',
    usage: null,
  }
}

/** 两段条目是否**逐个同引用**——没变就能整块复用。 */
function sameEntries(a: Entry[], b: Entry[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * 连续过程条目 → 过程组。
 *
 * 被非过程条目（用户消息、助手正文、审批）打断就另起一组——对话与过程
 * 交替时混在一组里，折叠起来会让人以为漏看了消息。
 */
export function groupProcesses(entries: Entry[]): ChatNode[] {
  const nodes: ChatNode[] = []
  let run: ProcessEntry[] = []

  const flush = () => {
    if (run.length === 0) return
    const running = run.some(isRunning)
    // 单条不成组：直接渲染，少一层壳。
    if (run.length < GROUP_MIN) {
      nodes.push(...nest(run))
    } else {
      nodes.push({
        type: 'group',
        id: `grp-${run[0]?.id ?? 'empty'}`,
        summary: groupSummary(run, running),
        running,
        depth: 0,
        children: nest(run),
      })
    }
    run = []
  }

  for (const entry of entries) {
    if (isProcessEntry(entry)) {
      run.push(entry)
    } else {
      flush()
      nodes.push(entryNode(entry, 0))
    }
  }
  flush()
  return nodes
}

/**
 * 按 `childOf` 建嵌套树（05 §3.2）。
 *
 * 子调用挂在父工具下面，缩进一级一档。找不到父的当根处理——子代理内部的
 * 调用，其父调用可能压根没出现在本回合的条目里（上游只给了 activity）。
 * 深度封顶 `MAX_TREE_DEPTH`：再深下去缩进只会挤掉标题。
 */
function nest(entries: Entry[]): ChatNode[] {
  const byId = new Map<string, EntryNode>()
  const roots: EntryNode[] = []

  for (const entry of entries) {
    const node = entryNode(entry, 0)
    byId.set(entry.id, node)
    roots.push(node)
  }

  const attached = new Set<string>()
  for (const node of roots) {
    const parentId = node.entry.kind === 'tool' ? node.entry.childOf : undefined
    if (!parentId) continue
    const parent = byId.get(parentId)
    if (!parent || parent === node) continue
    if (parent.depth + 1 >= MAX_TREE_DEPTH) continue
    node.depth = parent.depth + 1
    parent.children.push(node)
    attached.add(node.entry.id)
  }

  return roots.filter((node) => !attached.has(node.entry.id))
}

function entryNode(entry: Entry, depth: number): EntryNode {
  return { type: 'entry', entry, depth, children: [] }
}

function isRunning(entry: ProcessEntry): boolean {
  if (entry.kind === 'fileEdit') return entry.status === 'inProgress'
  return entry.streaming
}

/**
 * 复用判定（纯函数，单测覆盖）。
 *
 * 上一帧的块与这一帧的 `(meta, entries)` 同引用时沿用旧块——这样 `nodes`
 * 引用不变，`TurnBlock` 的 `memo` 才会跳过重渲染。任一不同就重建。
 */
export function reuseOrBuildBlock(
  old: TurnBlock | undefined,
  oldEntries: Entry[] | undefined,
  meta: TurnMeta,
  entries: Entry[],
): TurnBlock {
  if (old && old.meta === meta && sameEntries(oldEntries ?? [], entries)) return old
  return { meta, nodes: groupProcesses(entries) }
}

/**
 * 便捷 hook：按依赖算一次树，并**尽量复用**上一帧的回合块。
 *
 * # 为什么不是直接 `buildTurnBlocks`
 *
 * `buildTurnBlocks` 每个 delta 都会为**所有**回合重建 `nodes` 数组。而
 * `TurnBlock` 是 `memo` 的——它靠 `nodes` 引用判断要不要重渲染，新数组一来
 * 就全部失效：长会话里每条流式 delta 都把整张表重渲染一遍。
 *
 * 这里做一层按回合的复用：某回合的条目**逐个同引用**且元信息同引用时，
 * 直接沿用上一帧那个 block 对象。流式时通常只有最后一个回合在变，于是其余
 * 回合的 `nodes` 引用不变、`TurnBlock` 的 `memo` 真正生效，整表不再重渲染。
 * 判定用引用比较（reducer 复用未变条目），比"重建再对比"便宜得多。
 */
export function useTurnBlocks(entries: Entry[], turns: TurnMeta[]): TurnBlock[] {
  const cache = useRef<{ byTurn: Map<number, Entry[]>; blocks: Map<number, TurnBlock> } | null>(
    null,
  )

  return useMemo(() => {
    const byTurn = entriesByTurn(entries)
    const metaByIndex = new Map<number, TurnMeta>()
    for (const meta of turns) metaByIndex.set(meta.index, meta)
    const indices = blockIndices(byTurn, turns)

    const prev = cache.current
    const blocks = new Map<number, TurnBlock>()
    for (const index of indices) {
      blocks.set(
        index,
        reuseOrBuildBlock(
          prev?.blocks.get(index),
          prev?.byTurn.get(index),
          metaByIndex.get(index) ?? defaultMeta(index),
          byTurn.get(index) ?? [],
        ),
      )
    }
    cache.current = { byTurn, blocks }
    return indices.map((index) => blocks.get(index)!)
  }, [entries, turns])
}