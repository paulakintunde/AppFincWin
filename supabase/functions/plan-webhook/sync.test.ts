// Runs under Deno (`npm run test:deno`) and under Jest (the default suite): no runner imports.
import { processEvent, type SyncDeps } from './sync.ts';

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
function fixture(name: string): any {
  const p = DIR + name + '.json';
  const text = g.Deno ? g.Deno.readTextFileSync(p) : require('fs').readFileSync(p, 'utf8');
  return JSON.parse(text);
}
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-11-18T12:00:00Z');

function harness(over: Partial<SyncDeps> = {}, subscriberFixture = 'subscriber_active_apple') {
  const inserted: any[] = [];
  const fetched: string[] = [];
  const applied: { uid: string; snapshot: any; eventId: string }[] = [];
  const notes: { id: string; note: string }[] = [];
  const logs: Record<string, unknown>[] = [];
  const deps: SyncDeps = {
    insertEvent: async (e) => {
      inserted.push(e);
      return 'new';
    },
    fetchSubscriber: async (uid) => {
      fetched.push(uid);
      return fixture(subscriberFixture);
    },
    applyPlan: async (uid, snapshot, eventId) => {
      applied.push({ uid, snapshot, eventId });
    },
    markNote: async (id, note) => {
      notes.push({ id, note });
    },
    now: () => NOW,
    log: (l) => logs.push(l),
    ...over,
  };
  return { deps, inserted, fetched, applied, notes, logs };
}

run('new event: stores the scrubbed payload, re-fetches and applies once', async () => {
  const h = harness();
  const r = await processEvent(h.deps, fixture('event_initial_purchase'));
  assertEquals(r, { ok: true, result: 'applied' });
  assertEquals(h.inserted.length, 1);
  assertEquals('subscriber_attributes' in h.inserted[0].payload, false);
  assertEquals(h.fetched, [U1]);
  assertEquals(h.applied.length, 1);
  assertEquals(h.applied[0].eventId, 'evt-initial-0001');
  assertEquals(h.applied[0].snapshot.entitled, true);
});

run('duplicate that already applied: no fetch, no apply', async () => {
  const h = harness({ insertEvent: async () => 'duplicate' });
  const r = await processEvent(h.deps, fixture('event_renewal'));
  assertEquals(r, { ok: true, result: 'duplicate' });
  assertEquals(h.fetched.length, 0);
  assertEquals(h.applied.length, 0);
});

run('reprocesses an unapplied duplicate', async () => {
  const h = harness({ insertEvent: async () => 'unapplied' });
  const r = await processEvent(h.deps, fixture('event_renewal'));
  assertEquals(r, { ok: true, result: 'applied' });
  assertEquals(h.fetched.length, 1);
  assertEquals(h.applied.length, 1);
  assertEquals(h.applied[0].eventId, 'evt-renewal-0001');
});

run('TEST event: stored, noted, no fetch', async () => {
  const h = harness();
  const r = await processEvent(h.deps, fixture('event_test'));
  assertEquals(r, { ok: true, result: 'test' });
  assertEquals(h.fetched.length, 0);
  assertEquals(h.notes, [{ id: 'evt-test-0001', note: 'test' }]);
});

run('a retried TEST event is a duplicate once marked', async () => {
  const h = harness({ insertEvent: async () => 'duplicate' });
  assertEquals((await processEvent(h.deps, fixture('event_test'))).result, 'duplicate');
  assertEquals(h.notes.length, 0);
});

run('state follows the re-fetch, not event order: expiration then older renewal', async () => {
  const h = harness({}, 'subscriber_active_apple');
  await processEvent(h.deps, fixture('event_expiration'));
  await processEvent(h.deps, fixture('event_renewal'));
  assertEquals(h.fetched.length, 2);
  assertEquals(h.applied.map((a) => a.snapshot.entitled), [true, true]);
  const h2 = harness({}, 'subscriber_expired');
  await processEvent(h2.deps, fixture('event_renewal'));
  assertEquals(h2.applied[0].snapshot.entitled, false);
});

run('unknown event type still re-fetches and applies', async () => {
  const h = harness();
  const r = await processEvent(h.deps, fixture('event_unknown_type'));
  assertEquals(r.result, 'applied');
  assertEquals(h.fetched.length, 1);
});

run('anonymous app user with a UUID alias uses the UUID', async () => {
  const body = fixture('event_anonymous');
  body.event.aliases = ['$RCAnonymousID:abc123', U2];
  const h = harness();
  await processEvent(h.deps, body);
  assertEquals(h.fetched, [U2]);
});

run('anonymous with no UUID anywhere: stored with note anonymous, no apply', async () => {
  const h = harness();
  const r = await processEvent(h.deps, fixture('event_anonymous'));
  assertEquals(r, { ok: true, result: 'anonymous' });
  assertEquals(h.fetched.length, 0);
  assertEquals(h.applied.length, 0);
  assertEquals(h.notes, [{ id: 'evt-anon-0001', note: 'anonymous' }]);
});

run('TRANSFER applies for every UUID in transferred_from and transferred_to', async () => {
  const h = harness();
  const r = await processEvent(h.deps, fixture('event_transfer'));
  assertEquals(r.result, 'applied');
  assertEquals(h.fetched, [U1, U2]);
  assertEquals(h.applied.map((a) => a.uid), [U1, U2]);
});

run('SANDBOX environment is applied and passed through', async () => {
  const body = fixture('event_initial_purchase');
  body.event.environment = 'SANDBOX';
  const h = harness({}, 'subscriber_sandbox_apple');
  const r = await processEvent(h.deps, body);
  assertEquals(r.result, 'applied');
  assertEquals(h.inserted[0].environment, 'SANDBOX');
  assertEquals(h.applied[0].snapshot.environment, 'SANDBOX');
});

run('fetchSubscriber throwing returns a retry result and applies nothing', async () => {
  const h = harness({
    fetchSubscriber: async () => {
      throw new Error('revenuecat_500');
    },
  });
  const r = await processEvent(h.deps, fixture('event_renewal'));
  assertEquals(r, { ok: false, result: 'error', retry: true });
  assertEquals(h.applied.length, 0);
});

run('a body with no event id is rejected without touching storage', async () => {
  const h = harness();
  assertEquals((await processEvent(h.deps, { event: {} })).result, 'bad_event');
  assertEquals(h.inserted.length, 0);
});

run('logs carry type and result only, never the payload', async () => {
  const h = harness();
  await processEvent(h.deps, fixture('event_initial_purchase'));
  const text = JSON.stringify(h.logs);
  assertEquals(text.includes('example.invalid'), false);
  assertEquals(text.includes(U1), false);
});
