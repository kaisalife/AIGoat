import { useResources } from '../../store/resources'
import { Button } from '../primitives'
import {
  Badge,
  Centered,
  Desc,
  Dot,
  Empty,
  List,
  mcpAuthLabel,
  mcpTone,
  Meta,
  Name,
  Row,
  Section,
  Spinner_,
} from './resourceShared'
import type { DockPanelProps } from '../dock/types'
import s from './ResourceTabs.module.css'

/**
 * 技能 tab：本地可发现的能力包 + 配置的钩子。
 *
 * 两块放一起是因为它们回答同一个问题：「这个工作区里有什么能用的额外能力」，
 * 拆成两个 tab 会让人多点一次。
 */
export function SkillsTab({}: DockPanelProps) {
  const skills = useResources((s) => s.skills)
  const hooks = useResources((s) => s.hooks)
  const loading = useResources((s) => s.loading)

  if (loading && skills.length === 0 && hooks.length === 0) {
    return (
      <Centered>
        <Spinner_ />
      </Centered>
    )
  }

  return (
    <div className={s.pane}>
      <Section title="技能" count={skills.length}>
        {skills.length === 0 ? (
          <Empty text="当前工作区未发现技能。" />
        ) : (
          <List>
            {skills.map((item) => (
              <Row key={item.name}>
                <Name>{item.name}</Name>
                {item.description && <Desc>{item.description}</Desc>}
              </Row>
            ))}
          </List>
        )}
      </Section>

      <Section title="钩子" count={hooks.length}>
        {hooks.length === 0 ? (
          <Empty text="未配置钩子。" />
        ) : (
          <List>
            {hooks.map((hook) => (
              <Row key={hook.key} off={!hook.enabled}>
                <Dot tone={hook.enabled ? 'success' : 'neutral'} />
                <Name>{hook.key}</Name>
                <Desc>{hook.eventName}</Desc>
                <Badge tone={hook.enabled ? 'success' : 'neutral'}>
                  {hook.enabled ? '启用' : '停用'}
                </Badge>
              </Row>
            ))}
          </List>
        )}
      </Section>
    </div>
  )
}

/** MCP servers：连接状态 / 认证 / 工具数。 */
export function McpTab({}: DockPanelProps) {
  const servers = useResources((s) => s.mcpServers)
  const refresh = useResources((s) => s.refreshMcp)
  const loading = useResources((s) => s.loading)

  return (
    <div className={s.pane}>
      <Section
        title="MCP servers"
        count={servers.length}
        action={
          <Button variant="ghost" size="sm" onClick={() => void refresh()} loading={loading}>
            刷新
          </Button>
        }
      >
        {servers.length === 0 ? (
          <Empty text="尚未连接任何 MCP server。" />
        ) : (
          <List>
            {servers.map((server) => (
              <Row key={server.name}>
                <Dot tone={mcpTone(server.runtimeStatus, server.authStatus)} />
                <Name>{server.name}</Name>
                <span className={s.spacer} />
                <Meta>{server.toolCount} 工具</Meta>
                <Badge tone={mcpTone(server.runtimeStatus, server.authStatus)}>
                  {mcpAuthLabel(server.authStatus)}
                </Badge>
              </Row>
            ))}
          </List>
        )}
      </Section>
    </div>
  )
}