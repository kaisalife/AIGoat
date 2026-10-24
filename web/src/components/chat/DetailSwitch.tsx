import { DETAIL_LABELS, useUi, type DetailLevel } from '../../store/ui'
import { Menu } from '../primitives'

const LEVELS: DetailLevel[] = [0, 1, 2, 3]

/**
 * 工作详情档位切换（04 §3.2 的「4 档」）。
 *
 * # 为什么补这个入口
 *
 * 读档位的地方早就齐了——`TurnBlock` / `ToolCardRouter` / `ConversationStream`
 * 都按 `detailLevel` 投影，`DETAIL_LABELS` 也备好了。但**从来没有任何地方
 * 调 `setDetailLevel`**：档位永远停在默认的 1（常规），「概要 / 全部细节 /
 * 原始事件」三档根本够不着。这里补上入口，与「视图环」同属「怎么看这个会话」，
 * 所以放在会话头部。
 *
 * 用下拉而不是像视图环那样的分段控件：四个中文标签横排会把头部挤爆，
 * 而切档位是低频操作。
 */
export function DetailSwitch() {
  const level = useUi((s) => s.detailLevel)
  const setLevel = useUi((s) => s.setDetailLevel)

  return (
    <Menu
      align="end"
      width={180}
      trigger={
        <button type="button" className="btn btn--ghost" title="工作详情档位">
          详情：{DETAIL_LABELS[level]}
        </button>
      }
      groups={[
        {
          label: '工作详情',
          items: LEVELS.map((l) => ({
            id: String(l),
            label: DETAIL_LABELS[l],
            hint: l === level ? '当前' : undefined,
            onSelect: () => setLevel(l),
          })),
        },
      ]}
    />
  )
}
