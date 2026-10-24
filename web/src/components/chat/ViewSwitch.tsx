import type { MainViewName } from '../../bridge/client'
import { useLayoutStore } from '../layout/useLayoutStore'
import { SegmentedControl, type SegmentedOption } from '../primitives'

const OPTIONS: SegmentedOption<MainViewName>[] = [
  { value: 'chat', label: '会话' },
  { value: 'trajectory', label: '事件回放' },
]

/**
 * 中栏视图环（抄 dsh `conversation.view` 环，01 §2.1）。
 *
 * 两个视图读**同一条事件流**：会话是给人看的投影，事件回放是给排查用的
 * 投影（06 期填充）。放在会话头部而不是顶栏，因为它切的是「当前会话的
 * 看法」，不是整个应用去哪儿。
 *
 * 切视图不改任何状态——两个视图都是纯投影，随时来回切不会丢东西。
 */
export function ViewSwitch() {
  const view = useLayoutStore((s) => s.mainView)
  const setView = useLayoutStore((s) => s.setMainView)

  return (
    <SegmentedControl label="主区域视图" options={OPTIONS} value={view} onChange={setView} />
  )
}