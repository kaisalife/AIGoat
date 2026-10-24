// 引入即完成内置 tab 的注册（注册表是模块级的查表，见 registerBuiltinTabs.ts）。
import '../dock-tabs/registerBuiltinTabs'
import { DockShell } from '../dock/DockShell'

/**
 * 右栏槽：dock 容器。
 *
 * AppFrame 给的是 track（只占宽度），dock 面板自己锚定右缘——所以这里
 * 只负责"把 dock 放进右栏"，不做任何宽度或定位计算（那是 01 的事）。
 */
export function RightSlot() {
  return <DockShell />
}