// RevenueCat webhook check (09-06, D-13, T-09-22).
// Own secret per endpoint (IN-B03): REVENUECAT_WEBHOOK_HMAC_SECRET is used nowhere else.
export const SIGNATURE_HEADER = 'X-RevenueCat-Webhook-Signature';
export const TOLERANCE_SECONDS = 300;

// Constant-time comparison so a secret check never leaks timing.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export async function verifyRevenueCat(
  raw: string,
  getEnv: (n: string) => string | undefined,
  getHeader: (n: string) => string | null,
  nowSec: number,
): Promise<boolean> {
  const hmacSecret = getEnv('REVENUECAT_WEBHOOK_HMAC_SECRET');
  const authValue = getEnv('REVENUECAT_WEBHOOK_AUTH');

  // Two modes, never both required: if the RevenueCat dashboard does not send X-RevenueCat-Webhook-Signature, leave the HMAC secret unset and use the Authorization header (09-08 Task 4 records which one the dashboard sends and sets only that secret).
  if (hmacSecret) {
    const header = getHeader(SIGNATURE_HEADER);
    if (!header) return false;
    let t: string | undefined;
    let v1: string | undefined;
    for (const part of header.split(',')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      const val = part.slice(i + 1).trim();
      if (k === 't') t = val;
      else if (k === 'v1') v1 = val;
    }
    if (!t || !v1 || !/^\d+$/.test(t)) return false;
    if (Math.abs(nowSec - Number(t)) > TOLERANCE_SECONDS) return false;
    return safeEqual(await hmacHex(hmacSecret, `${t}.${raw}`), v1.toLowerCase());
  }
  if (authValue) return safeEqual(getHeader('Authorization') ?? '', 'Bearer ' + authValue);
  return false;
}
