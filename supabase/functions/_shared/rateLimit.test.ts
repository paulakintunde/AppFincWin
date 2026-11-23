// Runs under Deno (`npm run test:deno`) and under Jest (the default suite): no runner imports.
import { hitRateLimit, tooManyRequests, type RpcClient } from './rateLimit.ts';

type Runner = (name: string, fn: () => void | Promise<void>) => void;
const g = globalThis as unknown as { Deno?: { test: Runner }; test?: Runner };
const run: Runner = (name, fn) => (g.Deno ? g.Deno.test(name, fn) : (g.test as Runner)(name, fn));

function assertEquals(actual: unknown, expected: unknown, msg = ''): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
  }
}

const fake = (data: unknown, error: unknown = null): RpcClient => ({ rpc: async () => ({ data, error }) });

run('allowed when rpc says true', async () => {
  assertEquals(await hitRateLimit(fake(true), 'k:1', 3, 3600), { ok: true });
});

run('refused with seconds to the end of the window', async () => {
  // 3600 s window, now = 100 s into it -> 3500 s left
  const r = await hitRateLimit(fake(false), 'k:1', 3, 3600, () => 3600_000 * 5 + 100_000);
  assertEquals(r, { ok: false, retryAfter: 3500 });
});

run('retryAfter is at least 1', async () => {
  const r = await hitRateLimit(fake(false), 'k:1', 3, 60, () => 59_999 + 60_000);
  assertEquals(r.ok, false);
  if (!r.ok && r.retryAfter < 1) throw new Error('retryAfter below 1');
});

run('fails open on rpc error and logs without the key', async () => {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  try {
    assertEquals(await hitRateLimit(fake(null, { message: 'boom' }), 'secret-key:42', 3, 3600), { ok: true });
  } finally {
    console.log = orig;
  }
  assertEquals(lines.length, 1);
  if (!lines[0].includes('rate_limit_unavailable')) throw new Error('no log');
  if (lines[0].includes('secret-key')) throw new Error('key leaked');
});

run('tooManyRequests is a calm 429 with Retry-After', async () => {
  const res = tooManyRequests(42);
  assertEquals(res.status, 429);
  assertEquals(res.headers.get('Retry-After'), '42');
  assertEquals(await res.json(), { ok: false, error: 'rate_limited' });
});
