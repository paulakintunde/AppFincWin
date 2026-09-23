// Deliberately does not import '../client' (directly or transitively in a way that would
// execute it) — see the deviation note at the top of connection.ts. Only a fake client is
// ever passed in, so client.ts's eager getEnv() call is never reached.
import { checkConnection, type ConnectionCheckClient } from '../connection';

function fakeClient(limit: () => PromiseLike<{ data: unknown; error: { message: string } | null }>): ConnectionCheckClient {
  return {
    from: () => ({
      select: () => ({
        limit,
      }),
    }),
  };
}

describe('checkConnection', () => {
  it('resolves { ok: true, latencyMs } when the app_config select succeeds', async () => {
    const client = fakeClient(() => Promise.resolve({ data: [{ key: 'x' }], error: null }));

    const result = await checkConnection(client);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("resolves { ok: false, reason: 'error' } when supabase returns an error", async () => {
    const client = fakeClient(() => Promise.resolve({ data: null, error: { message: 'permission denied' } }));

    const result = await checkConnection(client);

    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it("resolves { ok: false, reason: 'offline' } when the request throws a network TypeError", async () => {
    const client = fakeClient(() => Promise.reject(new TypeError('Network request failed')));

    const result = await checkConnection(client);

    expect(result).toEqual({ ok: false, reason: 'offline' });
  });

  it("resolves { ok: false, reason: 'offline' } when the request exceeds the timeout", async () => {
    const client = fakeClient(() => new Promise(() => {})); // never resolves

    const result = await checkConnection(client, 20);

    expect(result).toEqual({ ok: false, reason: 'offline' });
  });
});
