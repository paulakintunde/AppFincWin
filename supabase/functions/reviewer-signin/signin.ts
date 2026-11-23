// ACC-11 reviewer sign-in: pure logic with injected dependencies (no Deno or network APIs here).
// Every refusal (not listed, wrong password, malformed body) returns the same status and body, and takes the same fixed time.
import type { RateResult } from '../_shared/rateLimit.ts';

export interface SignInTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface SignInDeps {
  isListed(email: string): Promise<boolean>;
  signInWithPassword(email: string, password: string): Promise<SignInTokens | null>;
  rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateResult>;
  sleep(ms: number): Promise<void>;
  // Optional; receives only event names, never the body.
  log?(line: unknown): void;
}

export interface SignInResult {
  status: number;
  body: unknown;
  retryAfter?: number;
}

export const FIXED_DELAY_MS = 400;
const IP_LIMIT = { limit: 10, windowSeconds: 900 };
const EMAIL_LIMIT = { limit: 5, windowSeconds: 900 };
const INVALID: SignInResult = { status: 401, body: { ok: false, error: 'invalid' } };

export async function reviewerSignIn(
  req: { method: string; ip: string; body: unknown },
  deps: SignInDeps,
): Promise<SignInResult> {
  if (req.method !== 'POST') return { status: 405, body: { ok: false, error: 'method' } };

  const ipHit = await deps.rateLimit('reviewer-ip:' + req.ip, IP_LIMIT.limit, IP_LIMIT.windowSeconds);
  if (!ipHit.ok) return { status: 429, body: { ok: false, error: 'rate_limited' }, retryAfter: ipHit.retryAfter };

  const b = req.body as { email?: unknown; password?: unknown } | null;
  if (
    !b || typeof b !== 'object' ||
    typeof b.email !== 'string' || typeof b.password !== 'string' ||
    b.email.length === 0 || b.password.length === 0 ||
    b.email.length > 254 || b.password.length > 200
  ) {
    await deps.sleep(FIXED_DELAY_MS);
    return INVALID;
  }
  const email = b.email.trim().toLowerCase();
  const password = b.password;

  const emailHit = await deps.rateLimit('reviewer-email:' + email, EMAIL_LIMIT.limit, EMAIL_LIMIT.windowSeconds);
  if (!emailHit.ok) return { status: 429, body: { ok: false, error: 'rate_limited' }, retryAfter: emailHit.retryAfter };

  let listed = false;
  try {
    listed = await deps.isListed(email);
  } catch {
    listed = false;
  }
  if (!listed) {
    await deps.sleep(FIXED_DELAY_MS);
    deps.log?.({ event: 'reviewer_signin_refused' });
    return INVALID;
  }

  // The password check and the fixed delay run together so both paths take at least FIXED_DELAY_MS.
  let tokens: SignInTokens | null = null;
  try {
    [tokens] = await Promise.all([deps.signInWithPassword(email, password), deps.sleep(FIXED_DELAY_MS)]);
  } catch {
    tokens = null;
  }
  if (!tokens) {
    deps.log?.({ event: 'reviewer_signin_refused' });
    return INVALID;
  }
  deps.log?.({ event: 'reviewer_signin_ok' });
  return {
    status: 200,
    body: { ok: true, access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_in: tokens.expires_in },
  };
}
