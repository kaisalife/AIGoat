import { useResources } from '../../store/resources'
import { useShell } from '../../store/shell'
import { Button } from '../primitives'
import {
  Badge,
  CodeName,
  Dot,
  Empty,
  EmptyHint,
  List,
  Name,
  Row,
  Section,
  sandboxDot,
  sandboxHint,
  sandboxLabel,
  sandboxPill,
} from './resourceShared'
import type { DockPanelProps } from '../dock/types'
import s from './ResourceTabs.module.css'

/**
 * 权限与沙箱 tab。
 *
 * `allowed: false` 的档位**置灰而不是隐藏**——隐藏会让用户以为功能不存在，
 * 置灰才能解释「为什么不让我选」。
 */
export function PermissionsTab({}: DockPanelProps) {
  const permissions = useResources((s) => s.permissions)
  const sandbox = useResources((s) => s.sandbox)
  const refresh = useResources((s) => s.refreshSandbox)

  return (
    <div className={s.pane}>
      <Section
        title="沙箱"
        action={
          <Button variant="ghost" size="sm" onClick={() => void refresh()}>
            重新检测
          </Button>
        }
      >
        <div className={s.row}>
          <Dot tone={sandboxDot(sandbox?.status)} />
          <Name>Windows 沙箱</Name>
          <span className={s.spacer} />
          <Badge tone={sandboxPill(sandbox?.status)}>{sandboxLabel(sandbox?.status)}</Badge>
        </div>
        <EmptyHint text={sandboxHint(sandbox?.status)} />
        {sandbox?.status === 'updateRequired' && (
          <p className={s.warn}>沙箱组件版本过期，需要更新后才能继续隔离。</p>
        )}
      </Section>

      <Section title="权限档位" count={permissions.length}>
        {permissions.length === 0 ? (
          <Empty text="未读到权限档位。" />
        ) : (
          <List>
            {permissions.map((p) => (
              <Row
                key={p.id}
                off={!p.allowed}
              >
                <Dot tone={p.allowed ? 'success' : 'neutral'} />
                <CodeName>{p.id}</CodeName>
                {p.description && <span className={s.desc}>{p.description}</span>}
                <span className={s.spacer} />
                {!p.allowed && <Badge tone="warning">不可选</Badge>}
              </Row>
            ))}
          </List>
        )}
      </Section>
    </div>
  )
}

/** 上下文 tab：token 余量条。 */
export function ContextTab({}: DockPanelProps) {
  const tokens = useShell((s) => s.tokens)
  const contextWindow = useShell((s) => s.contextWindow)
  const ratio = contextWindow > 0 ? Math.min(1, tokens.total / contextWindow) : 0

  return (
    <div className={s.pane}>
      <Section
        title="上下文"
        action={
          contextWindow > 0 ? (
            <span className={s.meta}>{(ratio * 100).toFixed(1)}%</span>
          ) : undefined
        }
      >
        <div className={s.meter} title={`上下文占用 ${(ratio * 100).toFixed(1)}%`}>
          <div
            className={ratio > 0.85 ? `${s.meterFill} ${s.meterWarn}` : s.meterFill}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <dl className={s.kv}>
          <dt className={s.k}>合计</dt>
          <dd className={s.v}>{tokens.total}</dd>

          <dt className={s.k}>输入</dt>
          <dd className={s.v}>
            {tokens.input}
            {tokens.cached > 0 && (
              <span className={s.ok} title="缓存命中的部分不重复计费">
                （缓存 {tokens.cached}）
              </span>
            )}
          </dd>

          <dt className={s.k}>输出</dt>
          <dd className={s.v}>{tokens.output}</dd>

          <dt className={s.k}>其中推理</dt>
          <dd className={s.v}>{tokens.reasoning}</dd>
        </dl>
        {contextWindow === 0 && (
          <EmptyHint text="模型目录里没填上下文窗口，所以不显示余量条。" />
        )}
      </Section>
    </div>
  )
}