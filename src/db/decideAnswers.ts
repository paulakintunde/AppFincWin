// 05.2 (DSU-19, DSU-21): the user's own answers that feed a check (pay arrival, expected income, held bridge,
// volatile cover). Owner-private under RLS; the client also filters on created_by. Key lists mirror the 05.2-03 grants.

import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export type DecideAnswerKind = 'pay_arrival' | 'expected_income' | 'held_bridge' | 'volatile_cover';

export interface DecideAnswerRow {
  id: string;
  household_id: string;
  created_by: string | null;
  kind: DecideAnswerKind;
  key: string;
  amount: number | null;
  bool_value: boolean | null;
  on_date: string | null;
  check_id: string | null;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export type NewDecideAnswer = Pick<
  DecideAnswerRow,
  'id' | 'household_id' | 'kind' | 'key' | 'amount' | 'bool_value' | 'on_date' | 'check_id'
>;
export type DecideAnswerPatch = Partial<Pick<DecideAnswerRow, 'amount' | 'bool_value' | 'on_date' | 'deleted_at'>>;

export const DECIDE_ANSWER_COLUMNS =
  'id, household_id, created_by, kind, key, amount, bool_value, on_date, check_id, deleted_at, version, created_at, updated_at';
export const DECIDE_ANSWER_INSERT_KEYS = [
  'id',
  'household_id',
  'kind',
  'key',
  'amount',
  'bool_value',
  'on_date',
  'check_id',
] as const satisfies readonly (keyof NewDecideAnswer)[];
export const DECIDE_ANSWER_PATCH_KEYS = [
  'amount',
  'bool_value',
  'on_date',
  'deleted_at',
] as const satisfies readonly (keyof DecideAnswerPatch)[];

const ENTITY = 'decide_answers' as const;
const UNIQUE_VIOLATION = '23505';

export async function fetchDecideAnswers(client: DbClient, userId: string, householdId: string): Promise<DecideAnswerRow[]> {
  const { data, error, status } = await client
    .from('decide_answers')
    .select(DECIDE_ANSWER_COLUMNS)
    .eq('household_id', householdId)
    .eq('created_by', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw toDbError(error, status);
  return (data as DecideAnswerRow[] | null) ?? [];
}

async function fetchDecideAnswer(client: DbClient, id: string): Promise<DecideAnswerRow | null> {
  const { data, error, status } = await client.from('decide_answers').select(DECIDE_ANSWER_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as DecideAnswerRow | null) ?? null;
}

/** A duplicate client id is read back as landed (MON-08). */
export async function insertDecideAnswer(client: DbClient, row: NewDecideAnswer): Promise<DecideAnswerRow> {
  assertAllowedKeys(row as unknown as Record<string, unknown>, DECIDE_ANSWER_INSERT_KEYS, 'insertDecideAnswer');
  const { data, error, status } = await client.from('decide_answers').insert(row).select(DECIDE_ANSWER_COLUMNS).single();
  if (!error) return data as DecideAnswerRow;
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchDecideAnswer(client, row.id);
    if (existing) return existing;
  }
  throw toDbError(error, status);
}

export async function updateDecideAnswer(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: DecideAnswerPatch
): Promise<DecideAnswerRow> {
  assertAllowedKeys(patch, DECIDE_ANSWER_PATCH_KEYS, 'updateDecideAnswer');
  const { data, error, status } = await client
    .from('decide_answers')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(DECIDE_ANSWER_COLUMNS);
  if (error) throw toDbError(error, status);
  const rows = (data as DecideAnswerRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as DecideAnswerRow;
  const serverRow = await fetchDecideAnswer(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
