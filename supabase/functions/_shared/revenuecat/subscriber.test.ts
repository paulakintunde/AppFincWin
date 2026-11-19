// Runs under Deno (`npm run test:deno`) and under Jest (the default suite): no runner imports.
import { fetchSubscriber, isUuid, scrubEvent, toSnapshot } from './subscriber.ts';

type Runner = (name: string, fn: () => void | Promise<void>) => void;
const g = globalThis as unknown as {
  Deno?: { test: Runner; readTextFileSync(p: string): string };
  test?: Runner;
};
declare const require: (m: string) => { readFileSync(p: string, enc: string): string };
const run: Runner = (name, fn) => (g.Deno ? g.Deno.test(name, fn) : (g.test as Runner)(name, fn));

function assertEquals(actual: unknown, expected: unknown, msg = ''): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

const DIR = 'supabase/functions/_fixtures/revenuecat/';
function fixture(name: string): Record<string, unknown> {
  const p = DIR + name + '.json';
  const text = g.Deno ? g.Deno.readTextFileSync(p) : require('fs').readFileSync(p, 'utf8');
  return JSON.parse(text);
}
const NOW = Date.parse('2026-11-18T12:00:00Z');

run('toSnapshot: trial on Play', () => {
  const s = toSnapshot(fixture('subscriber_trial_play'), NOW);
  assertEquals(s.entitled, true);
  assertEquals(s.period_type, 'TRIAL');
  assertEquals(s.store, 'PLAY_STORE');
  assertEquals(s.product_id, 'fincwin_duo:yearly');
  assertEquals(s.environment, 'PRODUCTION');
});

run('toSnapshot: active Apple is production, sandbox flag gives SANDBOX', () => {
  const a = toSnapshot(fixture('subscriber_active_apple'), NOW);
  assertEquals(a.store, 'APP_STORE');
  assertEquals(a.environment, 'PRODUCTION');
  assertEquals(a.period_type, 'NORMAL');
  assertEquals(a.original_transaction_id, '1000000000000001');
  assertEquals(toSnapshot(fixture('subscriber_sandbox_apple'), NOW).environment, 'SANDBOX');
});

run('toSnapshot: billing issue carries its dates', () => {
  const s = toSnapshot(fixture('subscriber_billing_issue_play'), NOW);
  assertEquals(s.entitled, true);
  assertEquals(s.billing_issue_detected_at, '2026-11-17T00:00:00Z');
  assertEquals(s.grace_period_expires_at, '2026-11-27T00:00:00Z');
});

run('toSnapshot: expired is not entitled; promotional with no expiry is', () => {
  const e = toSnapshot(fixture('subscriber_expired'), NOW);
  assertEquals(e.entitled, false);
  assertEquals(e.expires_at, null);
  const p = toSnapshot(fixture('subscriber_promotional'), NOW);
  assertEquals(p.entitled, true);
  assertEquals(p.store, 'PROMOTIONAL');
  assertEquals(p.expires_at, null);
  assertEquals(p.product_id, 'fincwin.household.month');
});

run('toSnapshot: an access entitlement past its date is not entitled', () => {
  const s = toSnapshot(fixture('subscriber_trial_play'), Date.parse('2026-12-01T00:00:00Z'));
  assertEquals(s.entitled, false);
});

run('toSnapshot: garbage body gives an empty, not-entitled snapshot', () => {
  const s = toSnapshot(null, NOW);
  assertEquals(s.entitled, false);
  assertEquals(s.product_id, null);
  assertEquals(s.store, null);
});

run('scrubEvent removes subscriber_attributes and email keys, keeps the allowed fields', () => {
  const ev = (fixture('event_initial_purchase') as { event: Record<string, unknown> }).event;
  const out = scrubEvent({ ...ev, email: 'redacted@example.invalid', $email: 'redacted@example.invalid' });
  assertEquals('subscriber_attributes' in out, false);
  assertEquals('email' in out, false);
  assertEquals('$email' in out, false);
  assertEquals(Object.keys(out).sort(), ['app_user_id', 'environment', 'event_timestamp_ms', 'id', 'product_id', 'store', 'type']);
  assertEquals(JSON.stringify(out).includes('@'), false);
});

run('isUuid accepts a Supabase UUID and rejects an anonymous RevenueCat id', () => {
  assertEquals(isUuid('11111111-1111-4111-8111-111111111111'), true);
  assertEquals(isUuid('$RCAnonymousID:abc'), false);
  assertEquals(isUuid(undefined), false);
});

run('fetchSubscriber sends the bearer key to the encoded URL and throws on non-2xx', async () => {
  let seenUrl = '';
  let seenAuth = '';
  const ok = (async (url: string, init: { headers: Record<string, string> }) => {
    seenUrl = url;
    seenAuth = init.headers.Authorization;
    return { ok: true, status: 200, json: async () => ({ hello: 1 }) };
  }) as unknown as typeof fetch;
  assertEquals(await fetchSubscriber('a/b', { apiKey: 'k', fetch: ok }), { hello: 1 });
  assertEquals(seenUrl, 'https://api.revenuecat.com/v1/subscribers/a%2Fb');
  assertEquals(seenAuth, 'Bearer k');
  const bad = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
  let threw = false;
  try {
    await fetchSubscriber('x', { apiKey: 'k', fetch: bad });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
