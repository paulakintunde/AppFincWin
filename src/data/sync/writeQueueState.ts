/**
 * 05.3-102 (UAT gap 22): what a paused write means. In @tanstack/query-core a mutation whose scope is busy cannot start
 * (`canStart = canFetch(networkMode) && config.canRun()`), so the retryer calls pause() and `state.isPaused` is true even
 * while the phone is online. Every write shares WRITE_SCOPE, so isPaused alone is not "offline". It is offline only when the
 * app's online state is also offline. Pure; no React.
 */
interface WriteState {
  status: string;
  isPaused: boolean;
}

/** Paused because there is no connection. */
export function isOfflinePaused(m: WriteState, online: boolean): boolean {
  return m.status === 'pending' && m.isPaused && !online;
}

/** Paused behind another write in the same scope while the phone is online. */
export function isQueuedBehind(m: WriteState, online: boolean): boolean {
  return m.status === 'pending' && m.isPaused && online;
}
