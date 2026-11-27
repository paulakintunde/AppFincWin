// Runs under Deno (`npm run test:deno`) and under Jest (the default suite): no runner imports.
import { clientIp, reviewerSignIn, type SignInDeps } from './signin.ts';

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
    rateLimitPeek: async () => ({ ok: true }),
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

run('email over the failure limit returns 429 with Retry-After, before any password check', async () => {
  const h = harness({ rateLimitPeek: async (k) => (k.startsWith('reviewer-email:') ? { ok: false, retryAfter: 7 } : { ok: true }) });
  const r = await reviewerSignIn(post({ email: 'review@example.test', password: 'right-password' }), h.deps);
  assertEquals(r.status, 429);
  assertEquals(r.retryAfter, 7);
  assertEquals(h.calls.includes('signin'), false);
});

// 10-review S-7: only failed attempts count toward the per-email limit.
function counting() {
  const hits: string[] = [];
  const peeks: string[] = [];
  const h = harness({
    rateLimit: async (k, limit, win) => {
      hits.push(`${k}|${limit}|${win}`);
      return { ok: true };
    },
    rateLimitPeek: async (k, limit, win) => {
      peeks.push(`${k}|${limit}|${win}`);
      return { ok: true };
    },
  });
  return { h, hits, peeks };
}

run('a wrong password counts one failure for the email', async () => {
  const c = counting();
  await reviewerSignIn(post({ email: 'Review@Example.test', password: 'x' }, '9.9.9.9'), c.h.deps);
  assertEquals(c.peeks, ['reviewer-email:review@example.test|5|900']);
  assertEquals(c.hits, ['reviewer-ip:9.9.9.9|10|900', 'reviewer-email:review@example.test|5|900']);
});

run('an unlisted email counts one failure for that email', async () => {
  const c = counting();
  await reviewerSignIn(post({ email: 'stranger@example.test', password: 'x' }, '9.9.9.9'), c.h.deps);
  assertEquals(c.hits, ['reviewer-ip:9.9.9.9|10|900', 'reviewer-email:stranger@example.test|5|900']);
});

run('a successful sign-in does not count toward the email limit', async () => {
  const c = counting();
  const r = await reviewerSignIn(post({ email: 'review@example.test', password: 'right-password' }, '9.9.9.9'), c.h.deps);
  assertEquals(r.status, 200);
  assertEquals(c.peeks, ['reviewer-email:review@example.test|5|900']);
  assertEquals(c.hits, ['reviewer-ip:9.9.9.9|10|900']);
});

run('the client IP is the right-most X-Forwarded-For entry', () => {
  assertEquals(clientIp('6.6.6.6, 10.0.0.1, 203.0.113.9'), '203.0.113.9');
  assertEquals(clientIp('203.0.113.9'), '203.0.113.9');
  assertEquals(clientIp(' 1.1.1.1 , '), '1.1.1.1');
  assertEquals(clientIp(''), 'unknown');
  assertEquals(clientIp(null), 'unknown');
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
