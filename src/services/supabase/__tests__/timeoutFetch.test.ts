import { addBreadcrumb } from '@sentry/react-native';
import { RequestTimeoutError, isLongOperationUrl, timeoutFetch, writeTableOf } from '../timeoutFetch';

jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn() }));

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

  describe('F-2 write request breadcrumbs', () => {
    const netCrumbs = () =>
      (addBreadcrumb as jest.Mock).mock.calls
        .map((c) => c[0] as { category: string; message: string; data: Record<string, unknown> })
        .filter((b) => b.category === 'net');
    beforeEach(() => (addBreadcrumb as jest.Mock).mockClear());

    it('a POST records method, table (no query string), ms and HTTP status', async () => {
      global.fetch = jest.fn(() => Promise.resolve(new Response('{}', { status: 201 }))) as unknown as typeof fetch;
      await timeoutFetch(`${BASE}/rest/v1/decide_checks?select=*&id=eq.secret`, { method: 'POST', body: '{"amount":1234}' });
      const crumbs = netCrumbs();
      expect(crumbs).toHaveLength(1);
      expect(crumbs[0]!.message).toBe('write request');
      expect(crumbs[0]!.data).toMatchObject({ method: 'POST', table: 'decide_checks', status: 201 });
      expect(typeof crumbs[0]!.data.ms).toBe('number');
      const text = JSON.stringify(crumbs[0]);
      expect(text).not.toContain('secret');
      expect(text).not.toContain('1234');
      expect(text).not.toContain('select');
    });

    it('an RPC records its function name; a failure and a timeout are recorded as such', async () => {
      global.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
      await outcome(timeoutFetch(`${BASE}/rest/v1/rpc/apply_patches`, { method: 'PATCH' }));
      expect(netCrumbs()[0]!.data).toMatchObject({ method: 'PATCH', table: 'apply_patches', status: 'failed' });

      (addBreadcrumb as jest.Mock).mockClear();
      global.fetch = hangingFetch() as unknown as typeof fetch;
      const p = outcome(timeoutFetch(`${BASE}/rest/v1/accounts?id=eq.1`, { method: 'DELETE' }));
      await jest.advanceTimersByTimeAsync(20_000);
      await p;
      expect(netCrumbs()[0]!.data).toMatchObject({ method: 'DELETE', table: 'accounts', status: 'timeout' });
    });

    it('a GET adds no breadcrumb', async () => {
      global.fetch = jest.fn(() => Promise.resolve(new Response('[]', { status: 200 }))) as unknown as typeof fetch;
      await timeoutFetch(`${BASE}/rest/v1/accounts?select=*`);
      await timeoutFetch(`${BASE}/rest/v1/accounts?select=*`, { method: 'HEAD' });
      expect(netCrumbs()).toHaveLength(0);
    });

    it('writeTableOf takes the segment after /rest/v1/ or /rpc/ up to the query string', () => {
      expect(writeTableOf(`${BASE}/rest/v1/decide_checks?select=*`)).toBe('decide_checks');
      expect(writeTableOf(`${BASE}/rest/v1/rpc/apply_patches`)).toBe('apply_patches');
      expect(writeTableOf(`${BASE}/functions/v1/delete-account`)).toBe('other');
    });
  });
});
