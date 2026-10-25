import { RequestTimeoutError, isLongOperationUrl, timeoutFetch } from '../timeoutFetch';

const BASE = 'https://x.supabase.co';

function hangingFetch() {
  return jest.fn(
    (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  );
}

async function outcome(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    (e: unknown) => e,
  );
}

describe('timeoutFetch', () => {
  const realFetch = global.fetch;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  it('D-88 reads time out at 15 s and writes at 20 s', async () => {
    global.fetch = hangingFetch() as unknown as typeof fetch;

    const read = outcome(timeoutFetch(`${BASE}/rest/v1/accounts`));
    await jest.advanceTimersByTimeAsync(14_999);
    let settled = false;
    void read.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const readErr = await read;
    expect(readErr).toBeInstanceOf(RequestTimeoutError);
    expect((readErr as RequestTimeoutError).longOp).toBe(false);
    expect((readErr as Error).message).toMatch(/network/i);

    const write = outcome(timeoutFetch(`${BASE}/rest/v1/rpc/apply_patches`, { method: 'POST' }));
    await jest.advanceTimersByTimeAsync(15_000);
    settled = false;
    void write.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(await write).toBeInstanceOf(RequestTimeoutError);
  });

  it('D-88 long operations get 120 s', async () => {
    global.fetch = hangingFetch() as unknown as typeof fetch;
    expect(isLongOperationUrl(`${BASE}/storage/v1/object/statements/a.pdf`)).toBe(true);
    expect(isLongOperationUrl(`${BASE}/rest/v1/rpc/seed_sample_data`)).toBe(true);
    expect(isLongOperationUrl(`${BASE}/rest/v1/rpc/apply_patches`)).toBe(false);

    const p = outcome(timeoutFetch(`${BASE}/storage/v1/object/statements/a.pdf`, { method: 'POST' }));
    await jest.advanceTimersByTimeAsync(119_999);
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const err = (await p) as RequestTimeoutError;
    expect(err).toBeInstanceOf(RequestTimeoutError);
    expect(err.longOp).toBe(true);
  });

  it('D-88 respects a caller abort and passes through a response', async () => {
    const caller = new AbortController();
    global.fetch = hangingFetch() as unknown as typeof fetch;
    const p = outcome(timeoutFetch(`${BASE}/rest/v1/x`, { signal: caller.signal }));
    caller.abort();
    const err = await p;
    expect(err).not.toBeInstanceOf(RequestTimeoutError);

    const ok = new Response('{}', { status: 200 });
    global.fetch = jest.fn(() => Promise.resolve(ok)) as unknown as typeof fetch;
    await expect(timeoutFetch(`${BASE}/rest/v1/x`)).resolves.toBe(ok);
  });
});
