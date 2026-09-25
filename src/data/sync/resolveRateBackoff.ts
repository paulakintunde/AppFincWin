// RD-05: resolve-rate throttles its caller server-side (~60/hour/user; a 429 with
// { ok: false, error: 'rate-limited' }). That response is never a permanent failure and
// never blocks the write queue -- resolve-rate is a best-effort, fire-and-forget follow-up
// entirely outside the mutation retry system (WR-A15), so the row simply stays rate_pending
// until a later call (or the daily fx_restamp_pending() sweep) picks it up.
//
// Without anything more, though, every new pending transaction added during a burst would
// independently call resolve-rate and independently get told to slow down. This module gives
// the client its own light, in-memory cooldown so a 429 actually reduces call volume rather
// than just being silently absorbed once per write.
const DEFAULT_BACKOFF_MS = 5 * 60_000; // 5 minutes, comfortably inside a ~60/hour budget

let throttledUntil = 0;

/** True while the client should skip calling resolve-rate entirely. */
export function isResolveRateThrottled(now: number = Date.now()): boolean {
  return now < throttledUntil;
}

/** Records a 429 from resolve-rate; extends the cooldown, never shortens an existing one. */
export function noteResolveRateThrottled(now: number = Date.now(), backoffMs: number = DEFAULT_BACKOFF_MS): void {
  throttledUntil = Math.max(throttledUntil, now + backoffMs);
}

/** Test-only: clears the in-memory cooldown between test cases. */
export function resetResolveRateBackoffForTests(): void {
  throttledUntil = 0;
}
