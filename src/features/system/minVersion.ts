// FND-09 / D-25: the server-authoritative minimum-version gate. `app_config` is readable by
// the `anon` role (supabase/migrations/20260922000200_app_config.sql), so this check can run
// before a user has signed in. Every failure path below returns `null` -- a connectivity blip,
// a slow network or a malformed response must never turn into an outage; only a
// successfully-fetched, genuinely lower version blocks the app (T-00-17-01).

export interface MinVersionQueryResult {
  data: { value: string } | null;
  error: { message: string } | null;
}

export interface MinVersionClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        maybeSingle(): PromiseLike<MinVersionQueryResult>;
      };
    };
  };
}

const DEFAULT_TIMEOUT_MS = 3000;
const APP_CONFIG_KEY = 'min_supported_version';

/**
 * Numeric major.minor.patch comparison, hand-rolled with no semver dependency. Missing
 * trailing segments default to 0 (`'1.0'` === `'1.0.0'`). Throws on a non-numeric segment --
 * a malformed version string is a programming error, not something to silently coerce.
 */
export function compareVersions(a: string, b: string): number {
  const [a0, a1, a2] = parseVersionParts(a);
  const [b0, b1, b2] = parseVersionParts(b);
  if (a0 !== b0) return a0 < b0 ? -1 : 1;
  if (a1 !== b1) return a1 < b1 ? -1 : 1;
  if (a2 !== b2) return a2 < b2 ? -1 : 1;
  return 0;
}

function parseVersionParts(version: string): [number, number, number] {
  const segments = version.split('.');
  const parts = ([0, 1, 2] as const).map((i) => {
    const raw = segments[i] ?? '0';
    if (!/^\d+$/.test(raw)) {
      throw new Error(`compareVersions: invalid version segment "${raw}" in "${version}"`);
    }
    return Number(raw);
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function isBelowMinimum(current: string, min: string): boolean {
  return compareVersions(current, min) < 0;
}

/**
 * Deviation (Rule 3 - blocking, mirrors src/services/supabase/connection.ts's own documented
 * fix): the real Supabase client is only ever reached via a lazy dynamic import, evaluated
 * solely when no client is passed in. client.ts calls getEnv() eagerly at module load, which
 * throws in every Jest run (no EXPO_PUBLIC_* vars in process.env) -- tests always pass an
 * explicit fake client, so client.ts is never touched.
 */
export async function fetchMinSupportedVersion(
  client?: MinVersionClient,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string | null> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const activeClient: MinVersionClient =
      client ?? ((await import('@/services/supabase')).supabase as unknown as MinVersionClient);

    const queryPromise = Promise.resolve(
      activeClient.from('app_config').select('value').eq('key', APP_CONFIG_KEY).maybeSingle()
    );
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('fetchMinSupportedVersion: timed out')), timeoutMs);
    });

    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
    if (error || !data) return null;
    return data.value;
  } catch {
    // Thrown network error, malformed response or the timeout race above -- all fail open.
    return null;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
