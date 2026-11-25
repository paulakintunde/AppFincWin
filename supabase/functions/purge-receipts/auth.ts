// 10.1-12 (D-08, D-19, RCP-05): shared-secret guard for purge-receipts (pg_cron is the only caller).
// Its own secret: one leaked secret must not authorise another endpoint (see purge-statement-uploads, IN-B03).
export const RECEIPT_PURGE_SECRET_ENV = 'RECEIPT_PURGE_SECRET';
export const RECEIPT_PURGE_SECRET_HEADER = 'x-receipt-purge-secret';

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
  const expected = getEnv(RECEIPT_PURGE_SECRET_ENV);
  const got = getHeader(RECEIPT_PURGE_SECRET_HEADER);
  return Boolean(expected) && Boolean(got) && safeEqual(expected as string, got as string);
}
