import { create } from 'zustand'

/**
 * 应用级对话框的种类。新增一种只改这个联合类型。
 *
 * 原先还有 `resources`（技能与钩子对话框），10 号板块把这两块搬进 dock
 * 的「技能」tab 之后就退役了——同一份内容有两个入口只会让人不知道该去哪。
 */
export type DialogKind = 'settings' | 'workspaces'

interface DialogState {
  settings: boolean
  workspaces: boolean
  open: (kind: DialogKind) => void
  close: (kind: DialogKind) => void
}

/**
 * 哪个对话框开着。
 *
 * 独立一个 store 而不是把它们的状态塞进 shell/ui store：这两个开关是
 * **应用级**的，挂在 App 的 props 里就得从 App 往下传到顶栏、侧栏、
 * 右栏三处，专开一个 store 才断得干净。加对话框时不用碰 App.tsx。
 */
export const useDialogs = create<DialogState>()((set) => ({
  settings: false,
  workspaces: false,
  open: (kind) => set({ [kind]: true }),
  close: (kind) => set({ [kind]: false }),
}))

export function openDialog(kind: DialogKind): void {
  useDialogs.getState().open(kind)
}

export function closeDialog(kind: DialogKind): void {
  useDialogs.getState().close(kind)
}