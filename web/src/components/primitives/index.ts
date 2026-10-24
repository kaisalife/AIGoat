/**
 * 唯一跨板块共享的控件库（抄 dsh 的 `ui-primitives`，但只落当前需要的部分）。
 *
 * 约定：
 * - 一控件一文件，样式一律 CSS Modules + `clsx`
 * - 样式里只准出现 `var(--ag-alias-*)`／`var(--ag-*)`，禁字面颜色
 * - 不引 headless 库、不引组件库——保持零 UI 依赖，与 dsh 的自研路线一致
 * - 每个文件 ≤300 行；需要更多样式就拆文件，不要在一个文件里堆
 */

export { Button } from './Button'
export type { ButtonProps, ButtonSize, ButtonVariant } from './Button'
// 提问类型放在 bridge/types（两边都要用），这里转出去只是为了让卡片
// 一行 import 就能拿到。
export type { UserInputOption, UserInputQuestion } from '../../bridge/types'
export { CodeBlock } from './CodeBlock'
export type { CodeBlockProps } from './CodeBlock'
export { DiffBlock, DiffStat, parseUnifiedDiff } from './DiffBlock'
export type { DiffBlockProps, DiffLine, DiffStatProps } from './DiffBlock'
export { DisclosureRow } from './DisclosureRow'
export type { DisclosureRowProps } from './DisclosureRow'
// MarkdownText 走懒加载包装（引擎约 76KB，不进首屏）。类型仍来自真实组件。
export { MarkdownText } from './MarkdownTextLazy'
export type { MarkdownTextProps } from './MarkdownText'
export { Menu } from './Menu'
export type { MenuProps } from './Menu'
export { MenuSurface } from './MenuSurface'
export type { MenuGroupSpec, MenuItemSpec, MenuSurfaceProps } from './MenuSurface'
export { Modal } from './Modal'
export type { ModalProps } from './Modal'
export { PathLabel } from './PathLabel'
export type { PathLabelProps } from './PathLabel'
export { Pill } from './Pill'
export type { PillProps, PillTone } from './Pill'
export { SegmentedControl } from './SegmentedControl'
export type { SegmentedControlProps, SegmentedOption } from './SegmentedControl'
export { SettingsField, SettingsSection } from './SettingsForm'
export type { SettingsFieldProps, SettingsSectionProps } from './SettingsForm'
export { Spinner } from './Spinner'
export type { SpinnerProps } from './Spinner'
export { StateDot } from './StateDot'
export type { StateDotProps, StateDotTone } from './StateDot'
export { Switch } from './Switch'
export type { SwitchProps } from './Switch'
export { Tag } from './Tag'
export type { TagProps, TagSize, TagTone } from './Tag'
export { TerminalBlock } from './TerminalBlock'
export type { TerminalBlockProps } from './TerminalBlock'
export { TextShimmer } from './TextShimmer'
export type { TextShimmerProps } from './TextShimmer'
export { Tooltip } from './Tooltip'
export type { TooltipPlacement, TooltipProps } from './Tooltip'
export { useAnchoredPosition } from './useAnchoredPosition'
export { useAnchoredMaxHeight } from './useAnchoredMaxHeight'
export { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer'
export { useCopyFeedback } from './useCopyFeedback'
export { writeClipboard } from './clipboard'
export { rankByName } from './rankByName'
export { observeComposition } from './keyboardComposition'