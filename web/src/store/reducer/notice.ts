/**
 * 提示类事件 → `notice` 条目。
 *
 * 单独成文件是因为这七类事件有一条共同约定：**都不该打断用户**。
 * 报错也要讲清楚发生了什么、用户能做什么（哪怕只是"稍后重试"），
 * 但不能弹窗、不能自动清掉——所以它们的处理方式高度一致，凑在一起
 * 反而看得清"哪些事件走这条通道"。
 */

import type { AgentEvent } from '../../bridge/types'
import type { CompactionEntry, CompactionNoticeEntry, NoticeEntry } from '../entries'
import type { TurnState } from '../turnState'
import { nextId, push } from './helpers'

/** 压缩完成态的卡。 */
function compactionCard(at: number, turn: number, byUser: boolean): CompactionEntry {
  return {
    id: nextId('compact'),
    kind: 'compaction',
    at,
    turn,
    running: false,
    byUser,
    summarizedCount: null,
  }
}

/** 压缩完成后的常驻提示条。 */
function compactionNotice(at: number, turn: number, byUser: boolean): CompactionNoticeEntry {
  return {
    id: nextId('cnotice'),
    kind: 'compactionNotice',
    at,
    turn,
    byUser,
    summarizedCount: null,
    dismissed: false,
  }
}

/** 压缩请求已发出、完成前的进行中态。 */
export function compactingEntry(at: number, turn: number): CompactionEntry {
  return {
    id: nextId('compact'),
    kind: 'compaction',
    at,
    turn,
    running: true,
    byUser: true,
  }
}

export function applyNotice(
  state: TurnState,
  event: AgentEvent,
  at: number,
): TurnState | null {
  switch (event.type) {
    case 'error':
      // willRetry 表示还在自己重试，用轻提示不打断。
      return note(state, at, event.willRetry ? 'info' : 'danger', event.message)
    case 'warning':
      return note(state, at, 'warn', event.message)
case 'contextCompacted':
      // 压缩是不可逆的信息损失，所以出**两样**：消息流里的卡（可展开看详情）
      // + 常驻提示条（滚上去也看得见，13 号板块）。
      // 协议没给被摘要的条数，就不显示数字，而不是编一个。
      return push(push(state, compactionCard(at, state.turn, false)), compactionNotice(at, state.turn, false))
    case 'sleep':
      return note(state, at, 'info', `Agent 主动等待 ${Math.round(event.durationMs / 1000)}s`)
    case 'hostCapabilityRequested':
      // 宿主没实现的能力：明确告知，而不是假装无事发生。
      return note(state, at, 'warn', `宿主尚未实现能力请求 ${event.method}`)
    case 'hook':
      return note(state, at, 'info', `钩子请求确认：${event.fragments.length} 段内容`, event.itemId)
    case 'unhandled':
      // 上游新增的通知：透传但不打扰，压成一行灰字。
      return note(state, at, 'info', `未建模通知 ${event.method}`)
    default:
      return null
  }
}

/** 插一条提示。id 缺省用序号；有真实 id 时用真的，刷新后不会变成另一条。 */
function note(
  state: TurnState,
  at: number,
  level: NoticeEntry['level'],
  text: string,
  id?: string,
): TurnState {
  return push(state, { id: id ?? nextId('note'), kind: 'notice', at, turn: state.turn, level, text })
}