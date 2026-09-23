// ENV-03 / D-13: a live connection check the app can show without requiring a signed-in
// user (app_config is readable pre-auth per D-25).
//
// Deviation (Rule 3 - blocking): the plan's literal `checkConnection(client = supabase, ...)`
// signature statically imports `supabase` from './client' at module load time. client.ts
// calls getEnv() eagerly at its own module top level, which throws EnvError when the
// EXPO_PUBLIC_* vars aren't present in process.env — true for every Jest run here, since
// nothing loads .env.local into the test process. That would make connection.test.ts unable
// to even import this module, contradicting its own design constraint ("must not import
// client.ts, to avoid env reads"). Fixed by making the fallback to the real client a lazy
// dynamic import, only evaluated when no client is passed in — the test always passes an
// explicit fake client, so client.ts is never touched during tests.

export type ConnectionResult = { ok: true; latencyMs: number } | { ok: false; reason: 'offline' | 'error' };

export interface ConnectionCheckClient {
  from(table: string): {
    select(columns: string): {
      limit(count: number): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

const DEFAULT_TIMEOUT_MS = 5000;

export async function checkConnection(
  client?: ConnectionCheckClient,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ConnectionResult> {
  const activeClient: ConnectionCheckClient =
    client ?? ((await import('./client')).supabase as unknown as ConnectionCheckClient);

  const start = Date.now();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const queryPromise = Promise.resolve(activeClient.from('app_config').select('key').limit(1));
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('checkConnection: timed out')), timeoutMs);
    });

    const { error } = await Promise.race([queryPromise, timeoutPromise]);
    if (error) {
      return { ok: false, reason: 'error' };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    // Both a thrown network TypeError and the timeout race above land here.
    return { ok: false, reason: 'offline' };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
