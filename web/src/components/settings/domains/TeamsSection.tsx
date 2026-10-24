import { useEffect, useState } from 'react'
import type { TeamRow } from '../../../bridge/client'
import { Button } from '../../primitives'
import f from '../SettingsFields.module.css'

export interface TeamsSectionProps {
  teams: TeamRow[]
  onSave: (team: string, workflow: string) => Promise<void>
}

/**
 * 团队工作流（SOP）编辑。参考 MetaGPT / GameGPT：把"团队怎么协作"写成一段
 * **有序的流程**随派单说明注入会话——主 agent 才会按流水线调度，而不是拿到
 * 一张成员清单自己猜分工。
 *
 * 团队**不是成员**，是成员之上的编组：成员用「团队」字段归队（在上面的成员
 * 表单里填），这里给团队写流程。没写流程的团队只列成员名。
 */
export function TeamsSection({ teams, onSave }: TeamsSectionProps) {
  return (
    <section>
      <div className="settings__section-head">
        <h3>团队与工作流（{teams.length}）</h3>
      </div>
      <p className="settings__hint">
        给每个团队写一段<b>工作流 / SOP</b>：按阶段列出「谁做什么、交给谁、交接什么产物」。
        它会随派单说明注入会话，主 agent 据此按流水线调度——交接靠落盘文档，每阶段有验收门。
      </p>
      {teams.length === 0 && (
        <p className="settings__empty">
          还没有团队。在成员表单的「团队」里填同一个名字即可成队。
        </p>
      )}
      <div className={f.form}>
        {teams.map((team) => (
          <TeamEditor key={team.name} team={team} onSave={onSave} />
        ))}
      </div>
    </section>
  )
}

function TeamEditor({ team, onSave }: { team: TeamRow; onSave: TeamsSectionProps['onSave'] }) {
  const [text, setText] = useState(team.workflow)
  const [busy, setBusy] = useState(false)

  // 外部保存成功后 teams 会刷新，把本地草稿对齐到最新值。
  useEffect(() => {
    setText(team.workflow)
  }, [team.workflow])

  const dirty = text.trim() !== team.workflow.trim()

  return (
    <div className={f.field}>
      <span className={f.label}>
        {team.name}
        {team.members.length > 0 ? `　成员：${team.members.join('、')}` : '　（暂无成员）'}
      </span>
      <textarea
        className={f.input}
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          '示例：\n1. 策划出 GDD / 数值表 / 关卡文档\n2. 架构据此出技术方案与项目骨架\n3. 美术按需求出素材\n4. 评审对照文档验收，通过才进下一阶段'
        }
      />
      <div className={f.actions}>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={!dirty}
          onClick={() => {
            setBusy(true)
            void onSave(team.name, text).finally(() => setBusy(false))
          }}
        >
          保存工作流
        </Button>
      </div>
    </div>
  )
}
