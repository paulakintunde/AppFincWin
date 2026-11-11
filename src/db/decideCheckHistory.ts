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
  if (error) throw toDbError(error, status);
  return data as unknown as DecideCheckHistoryRow;
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
