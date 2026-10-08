// Shared-secret auth for fx-monitor (IN-B03). Zero imports, so this loads
// identically under Deno (index.ts) and Jest (auth.test.ts).
//
// fx-monitor has its own secret, separate from fx-sync's. It auto-accepts
// held rates and re-stamps transactions, so one leaked secret must not
// authorise both endpoints. pg_cron (fx-monitor-daily) sends it from the
// fx_monitor_secret Vault row; the Edge Function reads FX_MONITOR_SECRET.

export const FX_MONITOR_SECRET_ENV = 'FX_MONITOR_SECRET';
export const FX_MONITOR_SECRET_HEADER = 'x-fx-monitor-secret';

// Constant-time comparison so a shared-secret check never leaks timing
// information about how many leading bytes matched (T-00-09-01).
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorized(
  getEnv: (name: string) => string | undefined,
  getHeader: (name: string) => string | null
): boolean {
  const expected = getEnv(FX_MONITOR_SECRET_ENV);
  const got = getHeader(FX_MONITOR_SECRET_HEADER);
  return Boolean(expected) && Boolean(got) && safeEqual(expected as string, got as string);
}
