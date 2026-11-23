// Runs under Deno (`npm run test:deno`) and under Jest (the default suite): no runner imports.
import { reviewerSignIn, type SignInDeps } from './signin.ts';

type Runner = (name: string, fn: () => void | Promise<void>) => void;
const g = globalThis as unknown as { Deno?: { test: Runner }; test?: Runner };
const run: Runner = (name, fn) => (g.Deno ? g.Deno.test(name, fn) : (g.test as Runner)(name, fn));

function assertEquals(actual: unknown, expected: unknown, msg = ''): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

const TOKENS = { access_token: 'a', refresh_token: 'r', expires_in: 3600 };
const INVALID = { ok: false, error: 'invalid' };

function harness(over: Partial<SignInDeps> = {}) {
  const calls: string[] = [];
  const deps: SignInDeps = {
    isListed: async (e) => {
      calls.push('listed:' + e);
      return e === 'review@example.test';
    },
    signInWithPassword: async (_e, p) => {
      calls.push('signin');
      return p === 'right-password' ? TOKENS : null;
    },
    rateLimit: async () => ({ ok: true }),
    sleep: async (ms) => {
      calls.push('sleep:' + ms);
    },
    ...over,
  };
  return { deps, calls };
}

const post = (body: unknown, ip = '1.2.3.4') => ({ method: 'POST', ip, body });

run('listed email with the right password returns tokens', async () => {
  const h = harness();
  const r = await reviewerSignIn(post({ email: 'Review@Example.test', password: 'right-password' }), h.deps);
  assertEquals(r.status, 200);
  assertEquals(r.body, { ok: true, ...TOKENS });
});

run('listed email with a wrong password returns the uniform 401', async () => {
  const h = harness();
  const r = await reviewerSignIn(post({ email: 'review@example.test', password: 'nope' }), h.deps);
  assertEquals(r.status, 401);
  assertEquals(r.body, INVALID);
});

run('unlisted email returns the identical 401, never tries the password, and waits 400 ms', async () => {
  const h = harness();
  const r = await reviewerSignIn(post({ email: 'stranger@example.test', password: 'right-password' }), h.deps);
  assertEquals(r.status, 401);
  assertEquals(r.body, INVALID);
  assertEquals(h.calls.includes('signin'), false);
  assertEquals(h.calls.includes('sleep:400'), true);
});

run('malformed bodies return the identical 401', async () => {
  const h = harness();
  const bodies: unknown[] = [
    null,
    'text',
    {},
    { email: 'a@b.c' },
    { email: 1, password: 'x' },
    { email: 'a'.repeat(250) + '@b.test', password: 'x' },
    { email: 'review@example.test', password: 'p'.repeat(201) },
  ];
  for (const b of bodies) {
    const r = await reviewerSignIn(post(b), h.deps);
    assertEquals(r.status, 401);
    assertEquals(r.body, INVALID);
  }
  assertEquals(h.calls.includes('signin'), false);
});

run('IP over the limit returns 429 with Retry-After', async () => {
  const h = harness({ rateLimit: async (k) => (k.startsWith('reviewer-ip:') ? { ok: false, retryAfter: 42 } : { ok: true }) });
  const r = await reviewerSignIn(post({ email: 'review@example.test', password: 'right-password' }), h.deps);
  assertEquals(r.status, 429);
  assertEquals(r.retryAfter, 42);
  assertEquals(h.calls.includes('signin'), false);
});

run('email over the limit returns 429 with Retry-After', async () => {
  const h = harness({ rateLimit: async (k) => (k.startsWith('reviewer-email:') ? { ok: false, retryAfter: 7 } : { ok: true }) });
  const r = await reviewerSignIn(post({ email: 'review@example.test', password: 'right-password' }), h.deps);
  assertEquals(r.status, 429);
  assertEquals(r.retryAfter, 7);
});

run('rate limit keys and limits', async () => {
  const seen: string[] = [];
  const h = harness({
    rateLimit: async (k, limit, win) => {
      seen.push(`${k}|${limit}|${win}`);
      return { ok: true };
    },
  });
  await reviewerSignIn(post({ email: 'Review@Example.test', password: 'x' }, '9.9.9.9'), h.deps);
  assertEquals(seen, ['reviewer-ip:9.9.9.9|10|900', 'reviewer-email:review@example.test|5|900']);
});

run('GET returns 405', async () => {
  const h = harness();
  const r = await reviewerSignIn({ method: 'GET', ip: '1.1.1.1', body: null }, h.deps);
  assertEquals(r.status, 405);
});

run('the password is never passed to any log call', async () => {
  const logs: string[] = [];
  const h = harness({ log: (l: unknown) => void logs.push(JSON.stringify(l)) });
  await reviewerSignIn(post({ email: 'review@example.test', password: 'secret-pw-123' }), h.deps);
  await reviewerSignIn(post({ email: 'stranger@example.test', password: 'secret-pw-123' }), h.deps);
  assertEquals(logs.some((l) => l.includes('secret-pw-123')), false);
});
