// WR-A01: the client every queued write is sent through. Lazily required for the same reason
// as each mutation module's lazySupabaseClient (dynamic import() throws under this project's
// Jest config; see transactions.ts), and gated on a usable session so a write never goes out
// under the anon key after a long offline period, where the column grants would reject it
// with a 42501 that looks permanent.
import type { DbClient } from '@/db/rows';
import { assertSession } from '@/db/session';

export async function writeClient(): Promise<DbClient> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const client = (require('@/services/supabase') as typeof import('@/services/supabase')).supabase;
  await assertSession(client);
  return client;
}
