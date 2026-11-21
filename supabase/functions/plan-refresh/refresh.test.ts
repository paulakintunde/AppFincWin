// Runs under Deno (`npm run test:deno`) and under Jest (the default suite): no runner imports.
import { refreshForCaller, sweep, type RefreshDeps } from './refresh.ts';

type Runner = (name: string, fn: () => void | Promise<void>) => void;
const g = globalThis as unknown as { Deno?: { test: Runner }; test?: Runner };
const run: Runner = (name, fn) => (g.Deno ? g.Deno.test(name, fn) : (g.test as Runner)(name, fn));

function assertEquals(actual: unknown, expected: unknown, msg = ''): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';
const SNAP = { entitled: true } as never;

function harness(over: Partial<RefreshDeps> = {}, payer: string | null = null, targets: string[] = []) {
  const applied: { id: string; eventId: string }[] = [];
  const logs: Record<string, unknown>[] = [];
  const deps: RefreshDeps = {
    fetchSnapshot: async () => SNAP,
    apply: async (id, _s, eventId) => {
      applied.push({ id, eventId });
    },
    householdPayer: async () => payer,
    sweepTargets: async () => targets,
    now: () => 1000,
    log: (l) => logs.push(l),
    ...over,
  };
  return { deps, applied, logs };
}

run('caller with no other payer applies once with a unique event id', async () => {
  const h = harness();
  assertEquals(await refreshForCaller(h.deps, U1), { ok: true });
  assertEquals(h.applied, [{ id: U1, eventId: `refresh:${U1}:1000` }]);
});

run('caller refresh also applies a different household payer', async () => {
  const h = harness({}, U2);
  assertEquals(await refreshForCaller(h.deps, U1), { ok: true });
  assertEquals(h.applied.map((a) => a.id), [U1, U2]);
});

run('caller who is the payer is applied once', async () => {
  const h = harness({}, U1);
  await refreshForCaller(h.deps, U1);
  assertEquals(h.applied.length, 1);
});

run('upstream failure returns upstream and applies nothing', async () => {
  const h = harness(
    {
      fetchSnapshot: async (id) => {
        if (id === U2) throw new Error('revenuecat_500');
        return SNAP;
      },
    },
    U2,
  );
  assertEquals(await refreshForCaller(h.deps, U1), { ok: false, error: 'upstream' });
  assertEquals(h.applied, []);
});

run('sweep applies every target and continues past a failure', async () => {
  const h = harness(
    {
      fetchSnapshot: async (id) => {
        if (id === U2) throw new Error('revenuecat_500');
        return SNAP;
      },
    },
    null,
    [U1, U2, U3],
  );
  assertEquals(await sweep(h.deps), { ok: true, applied: 2, failed: 1 });
  assertEquals(h.applied.map((a) => a.id), [U1, U3]);
});

run('sweep logs counts only, never ids', async () => {
  const h = harness({}, null, [U1]);
  await sweep(h.deps);
  assertEquals(JSON.stringify(h.logs).includes(U1), false);
});
