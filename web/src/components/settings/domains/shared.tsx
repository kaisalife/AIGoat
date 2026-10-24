import { Button, type ButtonProps } from '../../primitives'
import l from '../SettingsList.module.css'

/** 编辑态：null = 列表视图；`'new'` = 新建；数字 = 编辑第 N 项。 */
export type EditSlot = number | 'new' | null

/**
 * 待确认删除的项的键。
 *
 * 键里带上类型前缀：provider 与 model 可能重名（同一个网关名），不带前缀
 * 就会互相把对方的确认条顶掉。
 */
export function confirmKey(kind: 'provider' | 'model', id: string): string {
  return `${kind}:${id}`
}

/**
 * 两步确认的开关：再点一次就取消。
 *
 * 删除一定要两步——删提供商会连带删掉下面所有模型，这种级联在按钮旁看不见，
 * 只有确认条里写出来才知道自己在删什么。
 */
export function toggleConfirm(current: string | null, key: string): string | null {
  return current === key ? null : key
}

export interface SectionHeaderProps {
  title: string
  count: number
  action: string
  onAction: () => void
  disabled?: boolean
  title2?: string
}

/** 域内一节的标题条：计数 + 右侧主操作。 */
export function SectionHeader(props: SectionHeaderProps) {
  return (
    <div className="settings__section-head">
      <h3>
        {props.title}（{props.count}）
      </h3>
      <Button variant="ghost" onClick={props.onAction} disabled={props.disabled} title={props.title2}>
        {props.action}
      </Button>
    </div>
  )
}

export interface ConfirmBarProps {
  text: string
  onConfirm: () => void
  onCancel: () => void
}

/** 就地确认条。放在行末而不是弹窗——行还在原地，看得清在删哪一条。 */
export function ConfirmBar({ text, onConfirm, onCancel }: ConfirmBarProps) {
  return (
    <span className={l.confirm}>
      <span className={l.confirmText}>{text}</span>
      <Button variant="danger" onClick={onConfirm}>
        确认
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        取消
      </Button>
    </span>
  )
}

/** 列表行上的次要操作（编辑 / 设为当前）。 */
export function RowButton(props: ButtonProps) {
  return <Button variant="ghost" size="sm" {...props} />
}

/** 列表行上的破坏性操作。 */
export function RowDangerButton(props: ButtonProps) {
  return <Button variant="danger" size="sm" {...props} />
}

/** 域级校验错误：逐条列出，不截断——用户要照着改完。 */
export function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null
  return (
    <div className="settings__errors">
      {errors.map((e, i) => (
        <p key={i} className="settings__error">
          {e}
        </p>
      ))}
    </div>
  )
}