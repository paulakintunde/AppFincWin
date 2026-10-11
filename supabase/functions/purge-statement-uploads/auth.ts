// Shared-secret guard for purge-statement-uploads (pg_cron is the only caller).
// Its own secret (IN-B03): one leaked secret must not authorise another endpoint.
export const STATEMENT_PURGE_SECRET_ENV = 'STATEMENT_PURGE_SECRET';
export const STATEMENT_PURGE_SECRET_HEADER = 'x-statement-purge-secret';

// Constant-time comparison so a shared-secret check never leaks timing.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorized(
  getEnv: (n: string) => string | undefined,
  getHeader: (n: string) => string | null,
): boolean {
  const expected = getEnv(STATEMENT_PURGE_SECRET_ENV);
  const got = getHeader(STATEMENT_PURGE_SECRET_HEADER);
  return Boolean(expected) && Boolean(got) && safeEqual(expected as string, got as string);
}
