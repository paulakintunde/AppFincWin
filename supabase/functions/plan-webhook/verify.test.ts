// Runs under Deno (`npm run test:deno`) and under Jest (the default suite): no runner imports.
import { verifyRevenueCat } from './verify.ts';

type Runner = (name: string, fn: () => void | Promise<void>) => void;
const g = globalThis as unknown as { Deno?: { test: Runner }; test?: Runner };
const run: Runner = (name, fn) => (g.Deno ? g.Deno.test(name, fn) : (g.test as Runner)(name, fn));

function assertEquals(actual: unknown, expected: unknown, msg = ''): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

const SECRET = 'test-hmac-secret-not-real';
const AUTH = 'test-auth-value-not-real';
const BODY = '{"event":{"id":"evt-1"}}';
const NOW = 1795000000;

async function sign(t: number, raw = BODY, secret = SECRET): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${raw}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function check(env: Record<string, string>, headers: Record<string, string>, raw = BODY, now = NOW) {
  return verifyRevenueCat(raw, (n) => env[n], (n) => headers[n] ?? null, now);
}

const HMAC_ENV = { REVENUECAT_WEBHOOK_HMAC_SECRET: SECRET };

run('HMAC mode: valid signature passes with no Authorization header', async () => {
  const sig = `t=${NOW},v1=${await sign(NOW)}`;
  assertEquals(await check(HMAC_ENV, { 'X-RevenueCat-Webhook-Signature': sig }), true);
});

run('HMAC mode: valid signature passes even when the Authorization secret is also set', async () => {
  const sig = `t=${NOW},v1=${await sign(NOW)}`;
  assertEquals(await check({ ...HMAC_ENV, REVENUECAT_WEBHOOK_AUTH: AUTH }, { 'X-RevenueCat-Webhook-Signature': sig }), true);
});

run('HMAC mode: a correct Authorization header never substitutes for a missing signature', async () => {
  assertEquals(await check({ ...HMAC_ENV, REVENUECAT_WEBHOOK_AUTH: AUTH }, { Authorization: 'Bearer ' + AUTH }), false);
});

run('HMAC mode: wrong signature, tampered body and wrong secret fail', async () => {
  assertEquals(await check(HMAC_ENV, { 'X-RevenueCat-Webhook-Signature': `t=${NOW},v1=${'0'.repeat(64)}` }), false);
  const sig = `t=${NOW},v1=${await sign(NOW)}`;
  assertEquals(await check(HMAC_ENV, { 'X-RevenueCat-Webhook-Signature': sig }, BODY + ' '), false);
  const other = `t=${NOW},v1=${await sign(NOW, BODY, 'other')}`;
  assertEquals(await check(HMAC_ENV, { 'X-RevenueCat-Webhook-Signature': other }), false);
});

run('HMAC mode: 300 s edge passes, older or 301 s in the future fails', async () => {
  const old = NOW - 300;
  assertEquals(await check(HMAC_ENV, { 'X-RevenueCat-Webhook-Signature': `t=${old},v1=${await sign(old)}` }), true);
  const tooOld = NOW - 301;
  assertEquals(await check(HMAC_ENV, { 'X-RevenueCat-Webhook-Signature': `t=${tooOld},v1=${await sign(tooOld)}` }), false);
  const future = NOW + 301;
  assertEquals(await check(HMAC_ENV, { 'X-RevenueCat-Webhook-Signature': `t=${future},v1=${await sign(future)}` }), false);
});

run('HMAC mode: malformed headers fail', async () => {
  for (const h of ['', 'garbage', `t=abc,v1=${'0'.repeat(64)}`, `v1=${'0'.repeat(64)}`, `t=${NOW}`]) {
    assertEquals(await check(HMAC_ENV, { 'X-RevenueCat-Webhook-Signature': h }), false, h);
  }
});

run('Authorization-only mode: matching bearer value passes, a signature header is ignored', async () => {
  const env = { REVENUECAT_WEBHOOK_AUTH: AUTH };
  assertEquals(await check(env, { Authorization: 'Bearer ' + AUTH }), true);
  const sig = `t=${NOW},v1=${await sign(NOW)}`;
  assertEquals(await check(env, { 'X-RevenueCat-Webhook-Signature': sig }), false);
});

run('Authorization-only mode: missing or wrong value fails', async () => {
  const env = { REVENUECAT_WEBHOOK_AUTH: AUTH };
  assertEquals(await check(env, {}), false);
  assertEquals(await check(env, { Authorization: 'Bearer nope' }), false);
  assertEquals(await check(env, { Authorization: AUTH }), false);
});

run('neither secret set: always 403', async () => {
  const sig = `t=${NOW},v1=${await sign(NOW)}`;
  assertEquals(await check({}, { 'X-RevenueCat-Webhook-Signature': sig, Authorization: 'Bearer ' + AUTH }), false);
});
