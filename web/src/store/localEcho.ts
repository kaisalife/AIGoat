/**
 * 本地回显（04 §3.2）：发送即显，不等服务端。
 *
 * # 为什么必须有
 *
 * `turn/start` 的应答回来之前（网络慢、codex 正在排队）用户会看到
 * 「我明明按了回车，什么都没发生」。更糟的是断线时那条消息真的会丢——
 * 用户重发一次，历史里就有两条一样的话。
 *
 * # 收口规则：先按协议给的 id 认领，认不到再按正文匹配
 *
 * `turn/start` 有 `clientUserMessageId` 参数（docs/17 已核实），所以正常
 * 路径是精确匹配。正文匹配是兜底：协议在 `userMessage` item 上不一定回传
 * 那个 id（生成产物里没看到该字段），这时只能靠内容。
 *
 * 兜底的代价要认：用户连着发两条一模一样的消息时，第二条可能认领到第一条
 * 的回显——结果是两条 pending 变成一条已确认。消息本身没丢，只是少显示了
 * 一条重复的。这个代价比「吞掉真消息」小得多。
 */

import type { TurnState } from './turnState'
import type { UserEntry } from './entries'
import { nextId, push } from './reducer/helpers'

let echoSeq = 0

/** 插一条待确认的用户消息。返回它的 clientMsgId（协议字段，勿改名）。 */
export function echoUserMessage(
  state: TurnState,
  text: string,
): { state: TurnState; clientMsgId: string } {
  echoSeq += 1
  const clientMsgId = `cmid-${echoSeq}`
  const entry: UserEntry = {
    id: nextId('echo'),
    kind: 'user',
    at: Date.now(),
    turn: state.turn,
    text,
    pending: true,
    clientMsgId,
  }
  return { state: push(state, entry), clientMsgId }
}

/** 发送失败时把待确认那条撤掉——留着一条永远 pending 的消息只会误导。 */
export function dropEcho(state: TurnState, clientMsgId: string): TurnState {
  return {
    ...state,
    entries: state.entries.filter((e) => !(e.kind === 'user' && e.clientMsgId === clientMsgId)),
  }
}

/**
 * 找出这条权威消息该替换掉的那条回显，返回下标；找不到返回 -1。
 *
 * 替换时**沿用回显的时间戳**：否则用户会看到自己的消息在流里"跳"了一下。
 */
export function claimEcho(state: TurnState, clientMsgId: string | undefined, text: string): number {
  const rows = state.entries
  if (clientMsgId) {
    const byId = rows.findIndex((e) => e.kind === 'user' && e.clientMsgId === clientMsgId)
    if (byId >= 0) return byId
  }
  // 兜底要从最新往回**扫到底**，只找正文匹配的那条。
  //
  // 别写成「碰到第一条 pending 就比对、对不上就返回 -1」：那会在有多条
  // pending 时认错对象。协议通常不在 userMessage 上回传 clientUserMessageId
  // （见文件头），所以这条兜底是常态路径而非边缘情况——用户连发两条不同
  // 内容（A、B）时，服务端先确认 A，从后往前第一条 pending 是 B，正文不符，
  // 于是返回 -1：A 的正式消息被当成新条目追加，而回显 A 永远停在 pending，
  // 界面上同一句话出现两次、其中一条还带未确认的标记。
  for (let i = rows.length - 1; i >= 0; i--) {
    const e = rows[i]
    if (e?.kind === 'user' && e.pending && e.text === text) return i
  }
  return -1
}