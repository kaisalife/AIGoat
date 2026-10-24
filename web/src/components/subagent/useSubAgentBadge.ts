/**
 * AF 命令卡徽标（09 号板块的可选项，**这次做**）。
 *
 * # 为什么值得做
 *
 * 子代理是无头进程（`<exe> --agent task.json`），它跑的命令在消息流里就是
 * 一条普通的 `commandExecution`。用户看到"某条命令跑了很久、看不懂"时，
 * 没法判断这是 Agent 在自己排查，还是它在跑一个子代理。
 *
 * 打上「派给子代理」的标记之后，那张卡一眼就能看出"这活儿不在主线程上"。
 * 注册表本来就在（`bridge_subagents_list`），匹配只是本地字符串比较，
 * 代价远小于它省下的困惑。
 *
 * # 匹配方式：前缀
 *
 * 注册表里登记的是**绝对路径**，而命令常常用相对路径或经过 `cmd /c`。
 * 所以匹配"命令里是否包含任一已登记 exe 的文件名"，而不是全等——
 * 全等在 Windows 上几乎永远不成立。
 */
import { useEffect, useState } from 'react'
import type { SubAgentRow } from '../../bridge/client'
import { getClient } from '../../bridge/session'

/**
 * 这条命令是不是派给某个已登记子代理的。
 *
 * 查不到任何已登记子代理时返回 null（不显示徽标）——没有注册表的宿主
 * 硬给一个「子代理」标记比不显示更糟。
 *
 * 列表**全应用共享一次**：徽标挂在每一张命令卡上，若每个实例各自
 * `listSubAgents()`，消息流一长就是几十上百次重复 IPC。注册表在一次会话里
 * 基本不变，缓存整个会话期即可。
 */
export function useSubAgentBadge(command: string | undefined | null): SubAgentRow | null {
  const [rows, setRows] = useState<SubAgentRow[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (loaded) return
    let cancelled = false
    void loadSubAgents()
      .then((agents) => {
        if (!cancelled) setRows(agents)
      })
      // 读不到注册表就不显示徽标——它是个增强项，不该让命令卡报错。
      .catch((err) => {
        console.debug('[useSubAgentBadge] 加载子代理列表失败:', err)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [loaded])

  if (!command || rows.length === 0) return null
  const lowered = command.toLowerCase()
  return rows.find((row) => lowered.includes(fileNameOf(row.path).toLowerCase())) ?? null
}

let subAgentsCache: SubAgentRow[] | null = null
let subAgentsInflight: Promise<SubAgentRow[]> | null = null

/** 共享的注册表读取：并发调用合并成一次，成功后缓存整个会话。 */
function loadSubAgents(): Promise<SubAgentRow[]> {
  if (subAgentsCache) return Promise.resolve(subAgentsCache)
  if (!subAgentsInflight) {
    subAgentsInflight = getClient()
      .listSubAgents()
      .then((agents) => {
        subAgentsCache = agents
        return agents
      })
      .finally(() => {
        subAgentsInflight = null
      })
  }
  return subAgentsInflight
}

/** 从绝对路径取文件名（Windows 与 POSIX 都给最后一个分隔符）。 */
function fileNameOf(path: string): string {
  const base = path.split(/[\\/]/).filter(Boolean).pop() ?? path
  // 去掉 .exe：那不是命令里会出现的东西
  return base.replace(/\.exe$/i, '')
}