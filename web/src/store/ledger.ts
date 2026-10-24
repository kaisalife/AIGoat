/**
 * 事件账本（06 号板块的核心基建）。
 *
 * # 为什么是 append-only 而不是从消息流推
 *
 * 消息流是**投影**：归组、折叠、丢弃（比如 `Value::Null` 那几类刻意不发
 * 事件的项）。拿它当账本会有两个后果：
 * - 未识别事件查不到——它们在 reducer 里被压成一行灰字，细节没了
 * - 用户切一次视图档位，账本跟着变——账本必须是"发生过什么"的忠实记录
 *
 * 所以账本直接吃**原始事件流**，与 reducer 是同一条流的两个独立消费者
 * （dsh 同款的双注册表架构）。
 *
 * # ring buffer 与翻页
 *
 * 每线程 5000 行上限，超出丢最老的。要看更早的去 `thread/items/list`
 * 回补（`origin: 'history'`）。**不试图在本地无限增长**：一个跑了一天的
 * 会话能出几十万条，全留在内存里迟早把窗口拖死，而用户实际上只会回头看
 * 最近几轮。
 *
 * # 一源双投的接线点
 *
 * `store/slices/connection.ts` 的 `client.subscribe(...)` 是唯一的事件入口。
 * 那里 **先 push 账本再 ingest reducer**：顺序反了的话 reducer 抛异常时
 * 账本会少一段，而账本是排查问题时的第一手材料。
 */

import { create } from 'zustand'
import type { AnyEvent } from '../bridge/types'
import { LEDGER_CAP, sourceOf, type LedgerKind, type LedgerRow } from './ledger/row'
import { summarize } from './ledger/summarize'

interface LedgerState {
  /** threadId → 行数组（按时间升序）。null 线程用 `__none__`。 */
  rows: Record<string, LedgerRow[]>
  /**
   * threadId → kind → 该种类的行（时间升序）。**只索引 `INDEXED_KINDS`**。
   *
   * 有些消费者只关心某一种事件、却挂在常驻位置（改派徽标在每个回合头上、
   * 血缘面包屑在会话头），若各自订阅全量行，每条 delta 都会让它们重扫/重建
   * 一遍全表。给这几种建子索引后，它们只订阅小表、且只在真有该类事件时才更新。
   */
  indexed: Record<string, Partial<Record<LedgerKind, LedgerRow[]>>>
  /** 自增序号。跨线程共用，保证 key 全局唯一。 */
  seq: number
  /** 累计收到的事件数——用来在界面上显示"收到 N 条 / 留存 M 条"。 */
  total: number
  push: (event: AnyEvent) => void
  /** `events` 接受 `thread/items/list` 的包装条目 `{turnId, item}` 或扁平事件。 */
  pushHistory: (threadId: string, events: unknown[]) => void
  window: (threadId: string | null) => LedgerRow[]
  /** 清掉某线程的账本（会话被删时用，否则账本会一直涨）。 */
  drop: (threadId: string) => void
}

/**
 * 需要建子索引的种类：这些种类有"按种类查询、且消费者常驻"的模式。
 * 别随便往里加——每加一个就多一份内存副本。
 */
const INDEXED_KINDS = new Set<LedgerKind>(['guardEvent', 'subAgentActivity'])

const NO_THREAD = '__none__'

function keyOf(threadId: string | null | undefined): string {
  return threadId ?? NO_THREAD
}

export const useLedger = create<LedgerState>()((set, get) => ({
  rows: {},
  indexed: {},
  seq: 0,
  total: 0,

  push(event) {
    const kind = kindOf(event)
    if (!kind) return
    // seq/rows/total 在**同一次** set 里完成：拆成三次会让订阅者对每个事件
    // 被通知三遍——账本与消息流是同一条流的两个消费者，这是最热的路径。
    set(state => {
      const seq = state.seq + 1
      const row: LedgerRow = {
        id: seq,
        threadId: (event['threadId'] as string | undefined) ?? null,
        turnId: (event['turnId'] as string | undefined) ?? null,
        at: Date.now(),
        kind,
        source: sourceOf(kind),
        summary: summarize(event as Record<string, unknown>),
        payload: event,
        origin: 'live',
      }
      const key = keyOf(row.threadId)
      // 必须产出**新数组**：`useLedgerRows` 的选择器返回它，Zustand v4 用
      // `Object.is` 比较。原地 push 会让引用不变 → 订阅者永不重渲染。
      const next = [...(state.rows[key] ?? []), row]
      if (next.length > LEDGER_CAP) {
        next.splice(0, next.length - LEDGER_CAP)
      }
      const base = { rows: { ...state.rows, [key]: next }, seq, total: state.total + 1 }
      // 需要索引的种类另外进子索引（消费者只订阅它，见字段注释）。
      if (!INDEXED_KINDS.has(kind)) return base
      const bucket = state.indexed[key] ?? {}
      const indexedNext = [...(bucket[kind] ?? []), row]
      if (indexedNext.length > LEDGER_CAP) indexedNext.splice(0, indexedNext.length - LEDGER_CAP)
      return {
        ...base,
        indexed: { ...state.indexed, [key]: { ...bucket, [kind]: indexedNext } },
      }
    })
  },

  pushHistory(threadId, events) {
    if (events.length === 0) return
    // 历史行倒着补：协议的分页是升序，但补进来的应该是"更早"的，
    // 所以每批都插到已有行**前面**，这样最终顺序还是时间升序。
    set(state => {
      let seq = state.seq
      const batch = events
        .map((event): LedgerRow | null => {
          const flat = flattenHistoryEntry(event)
          if (!flat) return null
          const { kind, record } = flat
          seq += 1
          return {
            id: seq,
            threadId,
            turnId: (record['turnId'] as string | undefined) ?? null,
            // 历史 item 带 `timestamp`，没有就用当前时刻（标注 origin=history，
            // 时序总览会知道这条的时间不可信）。
            at: (record['timestamp'] as number | undefined) ?? Date.now(),
            kind,
            source: sourceOf(kind),
            summary: summarize(record),
            // Inspector 展开的是**原始包装**：翻译层只服务摘要与筛选，
            // 排查时看到的仍是服务端原样。
            payload: event,
            origin: 'history' as const,
          }
        })
        .filter((row): row is LedgerRow => row !== null)
      if (batch.length === 0) return {}
      const key = keyOf(threadId)
      return {
        rows: {
          ...state.rows,
          [key]: [...batch, ...(state.rows[key] ?? [])].slice(-LEDGER_CAP),
        },
        seq,
        total: state.total + batch.length,
      }
    })
  },

  window(threadId) {
    return get().rows[keyOf(threadId)] ?? []
  },

  drop(threadId) {
    const rows = { ...get().rows }
    delete rows[threadId]
    const indexed = { ...get().indexed }
    delete indexed[threadId]
    set({ rows, indexed })
  },
}))

/**
 * 事件的账本分类。返回 null 表示"不记账"（没有 type 的事件）。
 */
function kindOf(event: AnyEvent): LedgerKind | null {
  const type = String(event['type'] ?? '')
  return type ? (type as LedgerKind) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 协议 item 类型 → 账本 kind。历史回补没有实时流的细粒度，就近归并。 */
const HISTORY_KIND: Record<string, LedgerKind> = {
  userMessage: 'userMessage',
  agentMessage: 'textComplete',
  reasoning: 'reasoningDelta',
  commandExecution: 'toolCallStart',
  mcpToolCall: 'toolCallStart',
  dynamicToolCall: 'toolCallStart',
  collabAgentToolCall: 'toolCallStart',
  webSearch: 'toolCallStart',
  fileChange: 'fileEdit',
  plan: 'plan',
  contextCompaction: 'notice',
  subAgentActivity: 'subAgent',
  enteredReviewMode: 'reviewMode',
  exitedReviewMode: 'reviewMode',
  imageView: 'notice',
  imageGeneration: 'notice',
  sleep: 'notice',
}

/**
 * 把一条历史回补输入规整成账本行需要的 `{kind, record}`。
 *
 * `thread/items/list` 的条目是 `{turnId, item:{type,...}}` 的**包装**，而
 * kindOf/summarize 只认**顶层** `type`。之前调用方把包装原样塞进来：
 * kindOf 读不到顶层 type 得到空串（falsy），每一行都在"不记账"那里被丢掉，
 * **回补历史因此一直是空操作**——时序总览只有实时段，永远没有历史段。
 *
 * 这里拆包、把协议 item 类型翻译成账本 kind；个别类型补上实时事件才有的
 * 别名字段（`command`/`tool`→`name`、`text`→`delta`），summarize 才能给出
 * 有辨识度的一行摘要。不认识的 item 类型按 `unhandled` 落行（不丢）。
 */
function flattenHistoryEntry(
  entry: unknown,
): { kind: LedgerKind; record: Record<string, unknown> } | null {
  if (!isRecord(entry)) return null
  const item = entry['item']
  if (!isRecord(item) || typeof item['type'] !== 'string') {
    // 不是包装条目：按扁平事件走原路径（kindOf 的语义）。
    const kind = kindOf(entry as AnyEvent)
    return kind ? { kind, record: entry } : null
  }
  const type = item['type']
  const record: Record<string, unknown> = {
    ...item,
    turnId: entry['turnId'] ?? item['turnId'] ?? null,
  }
  const mapped = HISTORY_KIND[type]
  if (!mapped) {
    record['type'] = 'unhandled'
    record['method'] = type
    return { kind: 'unhandled', record }
  }
  record['type'] = mapped
  if (type === 'commandExecution') record['name'] = item['command'] ?? item['name']
  if (
    type === 'mcpToolCall' ||
    type === 'dynamicToolCall' ||
    type === 'collabAgentToolCall' ||
    type === 'webSearch'
  ) {
    record['name'] = item['tool'] ?? item['name']
  }
  if (type === 'reasoning') record['delta'] = item['text'] ?? item['summary']
  return { kind: mapped, record }
}

/**
 * 共享的空行数组：让 `useLedgerRows` 在没有数据时也返回**同一个**引用，
 * 否则 selector 每次都产出新数组，组件会被无意义地反复重渲染。
 */
const EMPTY: LedgerRow[] = []

/** 取某线程的账本（组件用这个，别直接摸 store 内部）。 */
export function useLedgerRows(threadId: string | null): LedgerRow[] {
  return useLedger((s) => s.rows[keyOf(threadId)] ?? EMPTY)
}

/** 取某线程某类事件的子索引（只在 `INDEXED_KINDS` 里有数据）。 */
function indexedRows(
  state: LedgerState,
  threadId: string | null,
  kind: LedgerKind,
): LedgerRow[] {
  return state.indexed[keyOf(threadId)]?.[kind] ?? EMPTY
}

/**
 * 某线程的 **guard 事件**。
 *
 * 改派徽标用它而不是全量行：徽标挂在**每个**回合头上，订阅全量会让每条
 * delta 都让所有徽标重扫一遍账本（O(回合数 × 行数)）。只订阅这份小索引后，
 * 既只扫小表，又只在真有 guard 事件时才重渲染。
 */
export function useGuardRows(threadId: string | null): LedgerRow[] {
  return useLedger((s) => indexedRows(s, threadId, 'guardEvent'))
}

/**
 * 某线程的 **子代理活动**。
 *
 * 血缘面包屑用它而不是全量行：它常驻会话头，订阅全量会让每条 delta 都
 * 重建一次子代理树（`buildTree` 是 O(N²)）。
 */
export function useSubAgentRows(threadId: string | null): LedgerRow[] {
  return useLedger((s) => indexedRows(s, threadId, 'subAgentActivity'))
}

/**
 * 一源双投的落点（06 号板块 §3.1）：`slices/connection.ts` 的 `subscribe` 里
 * **先 push 账本再 ingest reducer**。
 *
 * 顺序有讲究——reducer 万一抛异常，账本仍然完整，而账本正是排查「到底发生了什么」
 * 的第一手材料。
 *
 * 刻意**不**在这里再 subscribe 一次：一个 Tauri listener 发两遍事件，
 * 看起来省事，实际会让「这条事件是谁消费的」变得难以追踪。
 */
export function recordToLedger(event: AnyEvent): void {
  useLedger.getState().push(event)
}