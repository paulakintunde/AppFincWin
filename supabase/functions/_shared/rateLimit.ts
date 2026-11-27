// ACC-13: per-user fixed-window rate limit backed by public.rate_limit_hit (service role only).
// Keys are '<function>:' + the caller id read from the verified token, never from the request body.

export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export type RateResult = { ok: true } | { ok: false; retryAfter: number };

export async function hitRateLimit(
  admin: RpcClient,
  key: string,
  limit: number,
  windowSeconds: number,
  now: () => number = () => Date.now()
): Promise<RateResult> {
  let res: { data: unknown; error: unknown };
  try {
    res = await admin.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  } catch {
    res = { data: null, error: true };
  }
  if (res.error) {
    // Fails open so an outage of the counter never blocks store-mandated deletion. The key is not logged.
    console.log(JSON.stringify({ event: 'rate_limit_unavailable' }));
    return { ok: true };
  }
  if (res.data === true) return { ok: true };
  const nowSec = Math.floor(now() / 1000);
  const retryAfter = Math.max(1, windowSeconds - (nowSec % windowSeconds));
  return { ok: false, retryAfter };
}

// 10-review S-7: reads the counter without adding a hit (public.rate_limit_peek). Used where only failures count:
// peek before the attempt, rate_limit_hit after a failure. Fails open, as hitRateLimit does.
export async function peekRateLimit(
  admin: RpcClient,
  key: string,
  limit: number,
  windowSeconds: number,
  now: () => number = () => Date.now()
): Promise<RateResult> {
  let res: { data: unknown; error: unknown };
  try {
    res = await admin.rpc('rate_limit_peek', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  } catch {
    res = { data: null, error: true };
  }
  if (res.error) {
    console.log(JSON.stringify({ event: 'rate_limit_unavailable' }));
    return { ok: true };
  }
  if (res.data === true) return { ok: true };
  const nowSec = Math.floor(now() / 1000);
  return { ok: false, retryAfter: Math.max(1, windowSeconds - (nowSec % windowSeconds)) };
}

export function tooManyRequests(retryAfter: number): Response {
  return new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'Retry-After': String(retryAfter) },
  });
}
