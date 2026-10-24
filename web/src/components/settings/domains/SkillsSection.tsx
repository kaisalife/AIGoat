import clsx from 'clsx'
import { useCallback, useEffect, useState } from 'react'
import { getClient } from '../../../bridge/session'
import { describe } from '../useModelSettings'
import { Button, Switch } from '../../primitives'
import f from '../SettingsFields.module.css'

/**
 * 技能管理（子 Agent 域内）。
 *
 * 列表来自 `skills/list`（当前工作区发现的技能）；开关走
 * `skills/config/write`（按名启停，服务端回传 effectiveEnabled）；
 * 额外根目录走 `skills/extraRoots/set`（整体替换，协议没有回读通道，
 * 所以这里只做「追加」语义：本地列表初始为空，保存一次后即为全集）。
 */
export function SkillsSection({ cwd }: { cwd: string }) {
  const [skills, setSkills] = useState<{ name: string; description: string }[]>([])
  const [disabledNames, setDisabledNames] = useState<ReadonlySet<string>>(new Set())
  const [rootsDraft, setRootsDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyName, setBusyName] = useState<string | null>(null)
  const [savedRoots, setSavedRoots] = useState(false)

  const reload = useCallback(async () => {
    if (!cwd) {
      setSkills([])
      return
    }
    try {
      const [list, config] = await Promise.all([
        getClient().skills(cwd),
        getClient().skillsConfigRead().catch(() => null),
      ])
      setSkills(list)
      // 启用状态 = `skills.config` 规则按序匹配的**末次**结果；没有命中的
      // 规则默认启用（codex 的 SkillConfig 语义）。
      const rules: { name?: string; enabled: boolean }[] = Array.isArray(config)
        ? config
        : ((config as { config?: unknown } | null)?.config as
          | { name?: string; enabled: boolean }[]
          | undefined) ?? []
      const disabled = new Set<string>()
      for (const rule of rules) {
        if (typeof rule?.name === 'string') {
          if (rule.enabled) disabled.delete(rule.name)
          else disabled.add(rule.name)
        }
      }
      setDisabledNames(disabled)
      setError(null)
    } catch (err) {
      setSkills([])
      setError(`读取技能失败（需要先连接 codex）：${describe(err)}`)
    }
  }, [cwd])

  useEffect(() => {
    void reload()
  }, [reload])

  const toggle = async (name: string, next: boolean) => {
    setBusyName(name)
    setError(null)
    try {
      await getClient().skillsConfigWrite(name, next)
      setDisabledNames((prev) => {
        const next_ = new Set(prev)
        if (next) next_.delete(name)
        else next_.add(name)
        return next_
      })
    } catch (err) {
      setError(`切换技能「${name}」失败：${describe(err)}`)
    } finally {
      setBusyName(null)
    }
  }

  const saveRoots = async () => {
    setError(null)
    try {
      // 协议没有额外根目录的回读通道，这里保存的就是**全集**（整体替换）：
      // 文本框里一行一个根目录。
      const roots = rootsDraft
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean)
      await getClient().skillsRootsSet(roots)
      setSavedRoots(true)
      window.setTimeout(() => setSavedRoots(false), 1500)
    } catch (err) {
      setError(`保存技能根目录失败：${describe(err)}`)
    }
  }

  return (
    <section>
      <h3 className="settings__hint">
        <b>技能</b>（当前工作区发现的技能；开关写进 codex 配置，影响所有会话里该技能是否注入）
      </h3>
      {error && <p className="settings__error">{error}</p>}
      {!cwd && <p className="settings__hint">先打开一个工作区才能发现技能。</p>}
      {cwd && skills.length === 0 && <p className="settings__empty">当前工作区没有发现技能。</p>}
      <ul>
        {skills.map((skill) => (
          <li
            key={skill.name}
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--ag-space-2)' }}
          >
            <Switch
              checked={!disabledNames.has(skill.name)}
              disabled={busyName === skill.name}
              label={`启用技能 ${skill.name}`}
              onChange={(next) => void toggle(skill.name, next)}
            />
            <span>
              <b>{skill.name}</b>
              {skill.description && ` — ${skill.description}`}
            </span>
          </li>
        ))}
      </ul>

      <div className={f.form}>
        <div className={f.grid}>
          <label className={clsx(f.field, f.full)}>
            <span className={f.label}>额外技能根目录（一行一个，保存=整体替换）</span>
            <textarea
              className={f.input}
              rows={2}
              value={rootsDraft}
              onChange={(e) => setRootsDraft(e.target.value)}
              placeholder={'D:\\skills\\library\nD:\\more\\skills'}
            />
            <span className={f.hint}>
              协议没有回读通道：这里保存的是全集，请把要保留的根目录都列上。
            </span>
          </label>
        </div>
        <div className={f.actions}>
          <Button variant="primary" size="sm" onClick={() => void saveRoots()}>
            {savedRoots ? '已保存' : '保存根目录'}
          </Button>
        </div>
      </div>
    </section>
  )
}
