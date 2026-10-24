/**
 * 提交时的命令派发（08 号板块）。
 *
 * # 为什么「是命令」就等于「不发出去」
 *
 * 消息流里出现 `/compact` 有两种可能：用户想执行它，或者用户真的想问
 * 一个以斜杠开头的问题。前者是压倒性的常见情况，所以按命令处理。
 * 真要问后者，打字时先敲一个空格——触发符要求行首或空白之后（见
 * `TriggerManager`），而 `triggerSpan` 找的也是同一个位置。
 *
 * 三种派发里只有 `execute` 在这里执行：`popupSelect` 与 `action` 需要
 * 弹层选参数，提交时它们已经被弹层消费过了；在这里再执行一次等于
 * 「没选就执行」。
 */

import { getCommand, normalizeCommand } from '../../commands/registry'

/**
 * 尝试把整条消息当命令派发。
 *
 * 返回 true 表示"这条已被命令消费"，调用方**不应该**再发给模型。
 *
 * 判据是「消息以 `/命令名` 开头」，不是「最后一个字符是 `/`」——后者只有
 * 空命令 `/` 能命中，`/compact`、`/plan 帮我加缓存` 全都会被当成普通消息
 * 发给模型（这正是修复前的实际行为）。
 *
 * # 三类命令都在这里执行
 *
 * 弹层里选中一条命令，只是把 `/<id> ` **插进输入框**（见 `Composer.pick`
 * 走的 `applySelection`），**并不执行**——执行只此一处。早先这里只执行
 * `execute` 类，理由是"`popupSelect`/`action` 提交时已被弹层消费过了"，
 * 但弹层根本不执行命令：于是 `/compact`、`/export`、`/goal`… 全被消费掉、
 * 却什么都没发生（命令文本从输入框消失，用户以为坏了）。
 *
 * 需要"选中项"的命令（`/model`、`/permission`、`/skill`、`/file`）在没有
 * 选中项时由各自的 `run` 自行忽略（见 `builtin.ts`）——这里统一带 `text`
 * 调用即可，`/goal 把缓存加上` 这类"命令后跟文本"的用法因此才走得通。
 */
export function dispatchCommandLine(raw: string): boolean {
  const match = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(raw.trim())
  if (!match) return false
  const command = getCommand(normalizeCommand(match[1] ?? ''))
  if (!command) return false
  // 命令名之后剩下的文字：`/plan 帮我加上缓存` 的「帮我加上缓存」。
  const rest = (match[2] ?? '').trim()
  void command.run({ text: rest })
  return true
}