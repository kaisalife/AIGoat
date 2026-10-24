import { StatusBar } from './StatusBar'
import { useShell } from '../../store/shell'
import { shallow } from 'zustand/shallow'

/** 状态条槽：会话、回合、令牌、提示行——全是 store 派生值。 */
export function StatusBarSlot() {
  const {
    activeThreadId,
    currentTurnId,
    turnStatus,
    modelId,
    totalTokens,
    cachedTokens,
    elapsedMs,
    hint,
    connection,
    reconnect,
  } = useShell(
    (s) => ({
      activeThreadId: s.activeThreadId,
      currentTurnId: s.currentTurnId,
      turnStatus: s.turnStatus,
      modelId: s.modelId,
      totalTokens: s.tokens.total,
      cachedTokens: s.tokens.cached,
      elapsedMs: s.elapsedMs,
      hint: s.hint,
      connection: s.connection,
      reconnect: s.reconnect,
    }),
    shallow,
  )

  return (
    <StatusBar
      threadId={activeThreadId}
      turnId={currentTurnId}
      turnStatus={turnStatus}
      model={modelId || null}
      totalTokens={totalTokens}
      cachedTokens={cachedTokens}
      elapsedMs={elapsedMs}
      hint={hint}
      connection={connection}
      onReconnect={() => void reconnect()}
    />
  )
}