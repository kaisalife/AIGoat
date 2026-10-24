/**
 * 账本行（06 号板块）。
 *
 * # 与消息流条目的区别
 *
 * `store/entries.ts` 的 `Entry` 是**界面投影**：经过归组、折叠、渲染取舍。
 * 账本行是**原始记录**：一条事件进来就一行，不加工、不丢弃（除了 ring
 * 缓冲溢出）。
 *
 * 所以两者不能共用类型：拿账本行去渲染消息流会得到一堆没归组的过程条目；
 * 拿消息流条目去查账本会丢掉所有 `unhandled` 与 `debugEvent`。
 *
 * # 时长的来源
 *
 * 协议事件本身不带时间戳（只有 `thread/items/list` 的历史条目有）。
 * 实时流的时长靠**相邻两行的到达时间差**推：账本只记到达时刻，
 * 时长在投影时按行号差算。单独存 duration 反而要维护一套状态机，
 * 而且重连补历史时那些行根本没有"到达时刻"。
 */

/** 账本行的来源分类——对应 dsh「按来源检查」的四个徽章。 */
export type LedgerSource = 'model' | 'tool' | 'host' | 'unhandled'

/** 细分类。`source` 是它的归并，用来染色和筛选。 */
export type LedgerKind =
  // model：模型说了什么
  | 'textDelta'
  | 'textComplete'
  | 'reasoningDelta'
  | 'userMessage'
  | 'turnStarted'
  | 'turnComplete'
  | 'tokenUsage'
  // tool：Agent 做了什么
  | 'toolCallStart'
  | 'toolCallDelta'
  | 'toolCallEnd'
  | 'toolCallRequested'
  | 'functionCallOutput'
  | 'fileEdit'
  | 'fileEditPatch'
  | 'approvalRequested'
  | 'userInputRequested'
  | 'elicitationRequested'
  // host：宿主与协议侧的状态
  | 'threadEvent'
  | 'hostEvent'
  | 'guardEvent'
  | 'terminalEvent'
  | 'debugEvent'
  | 'plan'
  | 'notice'
  | 'reviewMode'
  // 实时事件类型就叫 `subAgentActivity`（`kindOf` 取的是事件 type）；
  // `subAgent` 是历史回补时 `HISTORY_KIND` 归并出来的同类项。
  | 'subAgentActivity'
  | 'subAgent'
  | 'goal'
  // unhandled：没见过也不认识
  | 'unhandled'

export interface LedgerRow {
  /** 自增序号。当 React key 用——时间戳会重复（同一毫秒多条）。 */
  id: number
  threadId: string | null
  turnId: string | null
  /** 到达时刻（ms）。历史回补的行用协议给的时间戳，没有则取当前。 */
  at: number
  kind: LedgerKind
  source: LedgerSource
  /** 一行摘要（工具名、文本首句、通知方法名…）。 */
  summary: string
  /** 原始事件。Inspector 展开的就是它。 */
  payload: unknown
  /**
   * 这一行来自实时流还是历史回补。
   *
   * `history` 的行时长不可信（到达时刻是拉取时刻，不是发生时刻），
   * 时序总览算甘特条时要区别对待。
   */
  origin: 'live' | 'history'
}

/** 账本每线程的行数上限。超出丢最老的。 */
export const LEDGER_CAP = 5000

/** 按 kind 归并到来源。徽章的四种颜色从这里来。 */
export function sourceOf(kind: LedgerKind): LedgerSource {
  switch (kind) {
    case 'textDelta':
    case 'textComplete':
    case 'reasoningDelta':
    case 'userMessage':
    case 'turnStarted':
    case 'turnComplete':
    case 'tokenUsage':
      return 'model'
    case 'toolCallStart':
    case 'toolCallDelta':
    case 'toolCallEnd':
    case 'toolCallRequested':
    case 'functionCallOutput':
    case 'fileEdit':
    case 'fileEditPatch':
    case 'approvalRequested':
    case 'userInputRequested':
    case 'elicitationRequested':
      return 'tool'
    case 'unhandled':
      return 'unhandled'
    default:
      return 'host'
  }
}

/** 来源的中文标签。表格与筛选器共用。 */
export const SOURCE_LABEL: Record<LedgerSource, string> = {
  model: '模型',
  tool: '工具',
  host: '宿主',
  unhandled: '未识别',
}