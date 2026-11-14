// 06.1 CO-D-64 (6): "What Decide said on {date}", one row per decided check. Owner-private under RLS
// (migration 20261111000100); the client also filters on the check. Written once, never updated; it goes
// with the check (cascade) and with the account, and is in the export manifest.

import { toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export interface DecideCheckHistoryRow {
  id: string;
  check_id: string;
  created_by: string | null; // stamped by the database; never sent
  said_on: string; // yyyy-mm-dd
  code: string;
  variant: string | null;
  result: Record<string, unknown>; // under 16 KB, enforced by the database
  created_at: string;
}

export type NewDecideCheckHistory = Pick<DecideCheckHistoryRow, 'id' | 'check_id' | 'said_on' | 'code' | 'variant' | 'result'>;

const UNIQUE_VIOLATION = '23505';

export const DECIDE_CHECK_HISTORY_COLUMNS = 'id, check_id, created_by, said_on, code, variant, result, created_at';
/** Mirrors the SQL insert grant exactly. */
export const DECIDE_CHECK_HISTORY_INSERT_KEYS = [
  'id',
  'check_id',
  'said_on',
  'code',
  'variant',
  'result',
] as const satisfies readonly (keyof NewDecideCheckHistory)[];

export async function insertCheckHistory(client: DbClient, row: NewDecideCheckHistory): Promise<DecideCheckHistoryRow> {
  assertAllowedKeys(row, DECIDE_CHECK_HISTORY_INSERT_KEYS, 'insertCheckHistory');
  const payload: Record<string, unknown> = {};
  for (const key of DECIDE_CHECK_HISTORY_INSERT_KEYS) payload[key] = row[key];
  const { data, error, status } = await client
    .from('decide_check_history')
    .insert(payload)
    .select(DECIDE_CHECK_HISTORY_COLUMNS)
    .single();
  if (!error) return data as unknown as DecideCheckHistoryRow;
  // 06.1-84 (G-61-12, CR-A03): the client id is the table's only unique key, so a 23505 is this row having landed on an earlier
  // try whose response was lost (a retry, or a paused write resumed). It is read back as success, never listed as failed.
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchCheckHistoryRow(client, row.id);
    if (existing) return existing;
  }
  throw toDbError(error, status);
}

async function fetchCheckHistoryRow(client: DbClient, id: string): Promise<DecideCheckHistoryRow | null> {
  const { data, error, status } = await client.from('decide_check_history').select(DECIDE_CHECK_HISTORY_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as unknown as DecideCheckHistoryRow | null) ?? null;
}

export async function listCheckHistory(client: DbClient, checkId: string): Promise<DecideCheckHistoryRow[]> {
  const { data, error, status } = await client
    .from('decide_check_history')
    .select(DECIDE_CHECK_HISTORY_COLUMNS)
    .eq('check_id', checkId)
    .order('said_on', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw toDbError(error, status);
  return (data as unknown as DecideCheckHistoryRow[] | null) ?? [];
}
