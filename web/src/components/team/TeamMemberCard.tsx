import clsx from 'clsx'
import { useState } from 'react'
import type { SubAgentRow } from '../../bridge/client'
import { ConfirmBar, RowButton, RowDangerButton } from '../settings/domains/shared'
import s from './TeamTab.module.css'

export interface TeamMemberCardProps {
  member: SubAgentRow
  /** 交给父层开编辑表单（SubAgentForm 全局唯一一份）。 */
  onEdit: (member: SubAgentRow) => void
  onRemove: (name: string) => Promise<void>
}

/**
 * 单个成员卡：注册表行的人形视图。
 *
 * 字段取舍与设置中心「子 Agent」域一致，但更紧凑——这里的目标是
 * 「一眼看清团队构成」，完整字段编辑走表单，不在卡上铺开。
 */
export function TeamMemberCard({ member, onEdit, onRemove }: TeamMemberCardProps) {
  const [confirming, setConfirming] = useState(false)
  const native = member.kind === 'codex'

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <span className={s.cardTitle}>{member.name}</span>
        <span className={clsx(s.badge, native ? s.badgeOk : s.badge)}>
          {native ? 'codex 原生' : '外部进程'}
        </span>
        {member.derivedFrom && <span className={s.badge}>副本</span>}
        {!native &&
          (member.exeExists ? (
            <span className={clsx(s.badge, s.badgeOk)}>就绪</span>
          ) : (
            <span className={clsx(s.badge, s.badgeDanger)}>exe 缺失</span>
          ))}
      </div>

      {member.desc && (
        <p className={s.cardDesc} title={member.desc}>
          {member.desc}
        </p>
      )}

      {member.derivedFrom && (
        <p className={s.cardMeta}>
          来自 {member.derivedFrom}
          {member.derivedStale && ' · 原成员已更新，建议重新特化'}
        </p>
      )}

      {native ? (
        <p className={s.cardMeta}>
          {[member.model, member.skills?.join(' / '), member.mcpServers?.join(' / ')]
            .filter(Boolean)
            .join(' ｜ ') || '未配能力面'}
        </p>
      ) : (
        <p className={s.cardMeta} title={member.path}>
          <code>{member.path}</code>
        </p>
      )}

      {member.prompt && (
        <p className={s.cardPrompt} title={member.prompt}>
          {member.prompt}
        </p>
      )}

      <div className={s.cardActions}>
        {confirming ? (
          <ConfirmBar
            text={`注销「${member.name}」？`}
            onConfirm={() => {
              setConfirming(false)
              void onRemove(member.name)
            }}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <>
            <RowButton onClick={() => onEdit(member)}>编辑</RowButton>
            <RowDangerButton onClick={() => setConfirming(true)}>注销</RowDangerButton>
          </>
        )}
      </div>
    </div>
  )
}
