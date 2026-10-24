export interface StatusBarProps {
  threadId: string | null
  turnId: string | null
  turnStatus: string | null
  model: string | null
  totalTokens: number
  cachedTokens: number
  elapsedMs: number | null
  hint: string | null
  /** 连接状态。非 connected 时显示「重新连接」——16 号板块的重连入口。 */
  connection: 'disconnected' | 'connecting' | 'ready' | 'error'
  onReconnect: () => void
}

export function StatusBar(props: StatusBarProps) {
  const {
    threadId,
    turnId,
    turnStatus,
    model,
    totalTokens,
    cachedTokens,
    elapsedMs,
    hint,
    connection,
    onReconnect,
  } = props

  return (
    <footer className="statusbar">
      {connection !== 'ready' && (
        <>
          <span className="statusbar__item">
            <button
              className="statusbar__reconnect"
              onClick={onReconnect}
              disabled={connection === 'connecting'}
              title="断线期间发生的事件补不回来；重连会按服务端基线校准历史"
            >
              {connection === 'connecting' ? '连接中…' : '连接已断 · 重新连接'}
            </button>
          </span>
          <Divider />
        </>
      )}

      <span className="statusbar__item truncate" title={threadId ?? undefined}>
        线程 <Field value={shortId(threadId)} placeholder="—" />
      </span>
      <Divider />
      <span className="statusbar__item">
        回合{' '}
        <Field value={shortId(turnId)} placeholder="—" />
        {turnStatus && <span className={'statusbar__badge ' + statusClass(turnStatus)}>{turnStatus}</span>}
      </span>
      <Divider />
      <span className="statusbar__item truncate" title={model ?? undefined}>
        模型 <Field value={model ?? '—'} />
      </span>
      <Divider />
      <span
        className="statusbar__item"
        title={
          cachedTokens > 0
            ? `输入 ${totalTokens - cachedTokens} 新增 + ${cachedTokens} 命中缓存`
            : '暂无缓存命中'
        }
      >
        tokens <Field value={totalTokens > 0 ? String(totalTokens) : '—'} />
        {cachedTokens > 0 && <span className="statusbar__muted">（缓存 {cachedTokens}）</span>}
      </span>

      {elapsedMs !== null && (
        <>
          <Divider />
          <span className="statusbar__item">耗时 {formatMs(elapsedMs)}</span>
        </>
      )}

      <span className="spacer" />

      {hint && (
        <span className="statusbar__hint truncate" title={hint}>
          {hint}
        </span>
      )}
    </footer>
  )
}

function Field(props: { value: string | null; placeholder?: string }) {
  if (!props.value) return <span className="statusbar__muted">{props.placeholder ?? '—'}</span>
  return <span className="statusbar__value">{props.value}</span>
}

function Divider() {
  return <span className="statusbar__sep" />
}

function shortId(id: string | null): string | null {
  if (!id) return null
  return id.length > 8 ? id.slice(0, 8) : id
}

function statusClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'is-ok'
    case 'failed':
      return 'is-danger'
    case 'interrupted':
      return 'is-warn'
    case 'inProgress':
      return 'is-accent'
    default:
      return ''
  }
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  return `${m}m${Math.round(s % 60)}s`
}
