import clsx from 'clsx'
import { useState } from 'react'
import { ModelPicker } from './ModelPicker'
import { useShell } from '../../store/shell'
import s from './ModelSeat.module.css'

export interface ModelSeatProps {
  /** true = 回合运行中，切换对新回合才生效。 */
  running: boolean
}

/**
 * composer 左下角的「当前模型」座位（14 号板块 §3.1）。
 *
 * # 取代顶栏的模型下拉
 *
 * 顶栏那一条已经被工作区、沙箱、审批徽标挤满了；模型是**每回合都可能变**
 * 的东西，它属于输入区旁边——发消息之前才需要知道它是什么。
 *
 * # 切换什么时候生效
 *
 * `bridge_settings_set_active_model` 只写配置，不重启连接。所以正在跑的
 * 这一轮仍用旧模型，下一回合才用新的。**这一点必须说出来**：
 * 用户点了切换就以为生效了，而模型列表还挂在顶上没变，他们会以为切换失败。
 */
export function ModelSeat({ running }: ModelSeatProps) {
  const [open, setOpen] = useState(false)
  const modelId = useShell((s) => s.modelId)
  const models = useShell((s) => s.models)
  const current = models.find((m) => m.id === modelId)

  return (
    <>
      <button
        type="button"
        className={clsx(s.seat, !current && s.seatEmpty)}
        onClick={() => setOpen(true)}
        title="切换模型（内置模型目录不参与）"
      >
        <span className={s.label}>模型</span>
        <span className={s.name}>{current?.displayName ?? '未配置'}</span>
        {running && <span className={s.pending}>下回合生效</span>}
      </button>

      <ModelPicker open={open} onClose={() => setOpen(false)} />
    </>
  )
}