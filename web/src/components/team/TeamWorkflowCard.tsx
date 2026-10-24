import { useEffect, useState } from 'react'
import { Button } from '../primitives'
import { RowButton } from '../settings/domains/shared'
import s from './TeamTab.module.css'

export interface TeamWorkflowCardProps {
  /** 团队名（保存时的键）。 */
  name: string
  workflow: string
  /** 团队规范：全体成员共同遵守的硬约束（特化副本会并进角色提示词）。 */
  spec: string
  /** 团队花名册：挑选进来的原初成员（副本随特化生成，原初不受影响）。 */
  roster: string[]
  /** 该团队现有的副本数（stale = 原初已被改过、建议重跑特化）。 */
  derived: { total: number; stale: number }
  /** 保存流程（空串 = 清除）。 */
  onSave: (team: string, workflow: string) => Promise<void>
  /** 保存规范（空串 = 清除）。 */
  onSaveSpec: (team: string, spec: string) => Promise<void>
  /** 按规范特化全队：生成副本，原初成员不动。 */
  onMaterialize: (team: string) => Promise<void>
}

type Field = 'workflow' | 'spec'

const PLACEHOLDER: Record<Field, string> = {
  workflow: '1. 策划产出 GDD\n2. 美术按 GDD 出图\n3. reviewer 验收（空串 = 清除）',
  spec: '命名用蛇形；交付物一律写进 assets/；评审不通过不得进入下一阶段（空串 = 清除）',
}

/**
 * 团队卡：规范（硬约束）+ 流程（阶段顺序）+ 特化入口。
 *
 * 两者分开存：流程回答"先做什么后做什么"，规范回答"所有人都必须怎样"。
 * 点「特化」只生成副本，原初成员一个字段都不动。
 */
export function TeamWorkflowCard(props: TeamWorkflowCardProps) {
  const { name, workflow, spec, roster, derived, onSave, onSaveSpec, onMaterialize } = props
  const [field, setField] = useState<Field | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  // 退出编辑时清空草稿；进入编辑由 start() 填入当前值——这样父层 reload
  // 带来的新值不会覆盖用户正在输入的内容。
  useEffect(() => {
    if (field === null) setText('')
  }, [field])

  const start = (next: Field) => {
    setText(next === 'workflow' ? workflow : spec)
    setField(next)
  }

  const current = field === 'workflow' ? workflow : spec
  const dirty = text !== current

  const save = async () => {
    if (field === null) return
    setBusy(true)
    try {
      if (field === 'workflow') await onSave(name, text)
      else await onSaveSpec(name, text)
      setField(null)
    } finally {
      setBusy(false)
    }
  }

  const materialize = async () => {
    setBusy(true)
    try {
      await onMaterialize(name)
    } finally {
      setBusy(false)
    }
  }

  if (field !== null) {
    return (
      <div className={s.card}>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>
            {name} · {field === 'workflow' ? '工作流' : '团队规范'}
          </span>
        </div>
        <div className={s.workflowEdit}>
          <textarea
            className={s.workflowInput}
            rows={field === 'spec' ? 3 : 4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER[field]}
          />
          <div className={s.cardActions}>
            <Button variant="ghost" size="sm" onClick={() => setField(null)} disabled={busy}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={!dirty} loading={busy}>
              保存
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <span className={s.cardTitle}>{name}</span>
        {derived.total > 0 && (
          <span className={s.badge}>副本 {derived.total}</span>
        )}
        <span className="spacer" />
        <RowButton onClick={() => start('spec')}>规范</RowButton>
        <RowButton onClick={() => start('workflow')}>流程</RowButton>
        <RowButton onClick={() => void materialize()}>
          {busy ? '特化中…' : '特化'}
        </RowButton>
      </div>

      {roster.length > 0 && (
        <p className={s.cardMeta}>
          花名册：{roster.join('、')}（挑人只生成副本，原初员工不受影响）
        </p>
      )}

      <span className={s.groupTitle}>团队规范</span>
      {spec.trim() ? (
        <pre className={s.workflow}>{spec}</pre>
      ) : (
        <p className={s.cardMeta}>未设置规范——写一段全队共同遵守的硬约束，如命名、风格、交付口径。</p>
      )}

      <span className={s.groupTitle}>工作流</span>
      {workflow.trim() ? (
        <pre className={s.workflow}>{workflow}</pre>
      ) : (
        <p className={s.cardMeta}>未设置工作流——写一段 SOP，主 agent 会按它调度这支团队。</p>
      )}

      {derived.stale > 0 && (
        <p className={s.cardMeta}>
          {derived.stale} 个副本已过期（原成员被改过），点「特化」重新生成。
        </p>
      )}
    </div>
  )
}
