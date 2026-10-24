import { Button, Tooltip } from '../primitives'
import s from './SidebarRail.module.css'

export interface SidebarRailProps {
  /** 有工作区才能新建；没有时这个入口指向「打开工作区」。 */
  hasCwd: boolean
  busy: boolean
  threadCount: number
  onNew: () => void
  onExpand: () => void
  onOpenSettings: () => void
  onOpenResources: () => void
}

/**
 * 左栏折叠态（01 §2.2）：56px rail，只留图标。
 *
 * rail 必须**完整可用**——它不是装饰性收窄。折叠后能做的只有四件事
 * （新建、切会话列表、设置、资源），所以只给这四个；其余操作回到展开态
 * 或走快捷键。少放几个入口比放一堆灰掉的更好。
 */
export function SidebarRail({
  hasCwd,
  busy,
  threadCount,
  onNew,
  onExpand,
  onOpenSettings,
  onOpenResources,
}: SidebarRailProps) {
  return (
    <nav className={s.rail} aria-label="会话与资源（折叠）">
      <Button
        variant="primary"
        size="sm"
        iconOnly
        aria-label={hasCwd ? '新建会话' : '打开工作区'}
        disabled={busy && hasCwd}
        onClick={onNew}
      >
        +
      </Button>

      <Tooltip content={`会话（${threadCount}）`} placement="right">
        <Button variant="ghost" size="sm" iconOnly aria-label="展开左栏" onClick={onExpand}>
          ☰
        </Button>
      </Tooltip>

      <span className={s.spacer} />

      <Tooltip content="资源" placement="right">
        <Button variant="ghost" size="sm" iconOnly aria-label="资源面板" onClick={onOpenResources}>
          ◫
        </Button>
      </Tooltip>
      <Tooltip content="设置" placement="right">
        <Button variant="ghost" size="sm" iconOnly aria-label="设置" onClick={onOpenSettings}>
          ⚙
        </Button>
      </Tooltip>
    </nav>
  )
}