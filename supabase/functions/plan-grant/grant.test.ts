// Runs under Deno (`npm run test:deno`) and under Jest (the default suite): no runner imports.
import { grantOwner, grantTesters, OWNER_END_TIME_MS, type GrantDeps } from './grant.ts';

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
const END = 1800000000000;

function harness(users: string[], over: Partial<GrantDeps> = {}) {
  const calls: string[] = [];
  const logs: Record<string, unknown>[] = [];
  let includePrelaunch: boolean | undefined;
  let testerUntil: number | undefined;
  const deps: GrantDeps = {
    listTesterUsers: async (p) => {
      includePrelaunch = p;
      return users;
    },
    currentPromoEnd: async () => null,
    recordGrant: async (id, ms) => {
      calls.push(`record:${id}:${ms}`);
    },
    postPromotional: async (id, ms) => {
      calls.push(`post:${id}:${ms}`);
    },
    refresh: async (id) => {
      calls.push(`refresh:${id}`);
    },
    setTesterUntil: async (ms) => {
      testerUntil = ms;
    },
    markOwner: async (id) => {
      calls.push(`owner:${id}`);
    },
    log: (l) => logs.push(l),
    ...over,
  };
  return { deps, calls, logs, state: () => ({ includePrelaunch, testerUntil }) };
}

run('testers: records, posts, refreshes, and sets tester_until', async () => {
  const h = harness([U1, U2]);
  const r = await grantTesters(h.deps, { endTimeMs: END, includePrelaunch: true });
  assertEquals(r, { ok: true, granted: 2, skipped: 0, failed: 0 });
  assertEquals(h.calls.slice(0, 3), [`record:${U1}:${END}`, `post:${U1}:${END}`, `refresh:${U1}`]);
  assertEquals(h.state(), { includePrelaunch: true, testerUntil: END });
});

run('testers: a promo already ending at the same time is skipped', async () => {
  const h = harness([U1, U2], { currentPromoEnd: async (id) => (id === U1 ? END : null) });
  const r = await grantTesters(h.deps, { endTimeMs: END });
  assertEquals(r, { ok: true, granted: 1, skipped: 1, failed: 0 });
  assertEquals(h.calls.some((c) => c.includes(U1)), false);
  assertEquals(h.state().includePrelaunch, false);
});

run('testers: one failed grant does not stop the rest and logs no ids', async () => {
  const h = harness([U1, U2, U3], {
    postPromotional: async (id) => {
      if (id === U2) throw new Error('revenuecat_500');
    },
  });
  const r = await grantTesters(h.deps, { endTimeMs: END });
  assertEquals(r, { ok: true, granted: 2, skipped: 0, failed: 1 });
  assertEquals(JSON.stringify(h.logs).includes(U2), false);
});

run('owner: grants to 2100-01-01 and marks the household owner', async () => {
  const h = harness([]);
  assertEquals(await grantOwner(h.deps, { userId: U1 }), { ok: true });
  assertEquals(OWNER_END_TIME_MS, 4102444800000);
  assertEquals(h.calls, [`record:${U1}:${OWNER_END_TIME_MS}`, `post:${U1}:${OWNER_END_TIME_MS}`, `refresh:${U1}`, `owner:${U1}`]);
});

run('owner: an already-granted owner is not posted twice but is still marked', async () => {
  const h = harness([], { currentPromoEnd: async () => OWNER_END_TIME_MS });
  assertEquals(await grantOwner(h.deps, { userId: U1 }), { ok: true });
  assertEquals(h.calls, [`owner:${U1}`]);
});

run('owner: upstream failure is reported and not marked', async () => {
  const h = harness([], {
    postPromotional: async () => {
      throw new Error('revenuecat_500');
    },
  });
  assertEquals(await grantOwner(h.deps, { userId: U1 }), { ok: false, error: 'upstream' });
  assertEquals(h.calls.some((c) => c.startsWith('owner:')), false);
});
