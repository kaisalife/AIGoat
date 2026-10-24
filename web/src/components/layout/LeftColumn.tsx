import { SidebarLeft, type SidebarLeftProps } from './SidebarLeft'
import s from './LeftColumn.module.css'

/**
 * 左栏槽的内容：只有会话列表。
 *
 * 原先这里上面还叠着一个文件树列（`Explorer`）——文件树现在是 dock 的
 * 「文件」tab（10 号板块），所以左栏只剩一层。
 *
 * 留一个组件而不是让 `LeftSlot` 直接渲染 `SidebarLeft`：左栏以后可能
 * 再加别的（工作区快捷入口之类），有这一层就不用改 `LeftSlot`。
 */
export function LeftColumn(props: SidebarLeftProps) {
  return (
    <div className={s.column}>
      <div className={s.threads}>
        <SidebarLeft {...props} />
      </div>
    </div>
  )
}