// 09-23 (owner P3): does the setup account or goal already exist on the server? Any row with that id counts, archived or
// deleted included, so a record the person removed is never made again. RLS scopes the read to the person's household.
import { toDbError } from './errors';
import type { DbClient } from './rows';

export async function setupRowExists(client: DbClient, kind: 'account' | 'goal', id: string): Promise<boolean> {
  const table = kind === 'account' ? 'accounts' : 'savings_goals';
  const { data, error, status } = await client.from(table).select('id').eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  return data !== null;
}
