import { Button } from '../primitives'
import s from './WelcomeView.module.css'

export interface WelcomeViewProps {
  /** 工作区对话框打开中——按钮要跟着转。 */
  busy: boolean
  onOpenWorkspace: () => void
}

/**
 * 空态：还没有工作区、也没有选中会话时的中栏。
 *
 * 给一个明确的入口而不是留白。用户第一次打开时看到的是「打开一个文件夹」
 * 这句话，而不是不知道该点哪儿。
 *
 * 文案说明白**为什么**需要工作区：会话按文件夹分开，代码/技能/钩子都跟着切。
 * 只说「请选择目录」的话，多半会被当成流程上的多余一步。
 */
export function WelcomeView({ busy, onOpenWorkspace }: WelcomeViewProps) {
  return (
    <div className={s.welcome}>
      <h2>先打开一个工作区</h2>
      <p>
        工作区就是一个文件夹。会话按文件夹分开，切换工作区只看到那个目录里的会话，
        代码、技能、钩子也都跟着切。
      </p>
      <Button variant="primary" loading={busy} onClick={onOpenWorkspace}>
        打开工作区…
      </Button>
    </div>
  )
}