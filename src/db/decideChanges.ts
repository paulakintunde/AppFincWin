// 05-38 (D-27): dated changes, stored per user. Key lists mirror the 05-32 grants exactly.
// Same shape as src/db/categoryRules.ts: client-injected id, replay-safe insert (MON-08),
// version-conditional update.

import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export interface DecideChangeRow {
  id: string;
  household_id: string;
  created_by: string;
  updated_by: string | null;
  kind: 'income' | 'spending';
  name: string | null;
  monthly_amount: number;
  currency: string;
  start_month: string;
  end_month: string | null;
  is_sample: boolean;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export const DECIDE_CHANGE_COLUMNS =
  'id, household_id, created_by, updated_by, kind, name, monthly_amount, currency, start_month, end_month, is_sample, deleted_at, version, created_at, updated_at';

export type NewDecideChange = Pick<
  DecideChangeRow,
  'id' | 'household_id' | 'kind' | 'name' | 'monthly_amount' | 'currency' | 'start_month' | 'end_month'
>;

export type DecideChangePatch = Partial<
  Pick<DecideChangeRow, 'kind' | 'name' | 'monthly_amount' | 'currency' | 'start_month' | 'end_month' | 'deleted_at'>
>;

export const DECIDE_CHANGE_INSERT_KEYS = [
  'id',
  'household_id',
  'kind',
  'name',
  'monthly_amount',
  'currency',
  'start_month',
  'end_month',
] as const satisfies readonly (keyof NewDecideChange)[];

export const DECIDE_CHANGE_PATCH_KEYS = [
  'kind',
  'name',
  'monthly_amount',
  'currency',
  'start_month',
  'end_month',
  'deleted_at',
] as const satisfies readonly (keyof DecideChangePatch)[];

const ENTITY = 'decide_changes' as const;
const UNIQUE_VIOLATION = '23505';
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function validateMonths(start: string | undefined, end: string | null | undefined): void {
  if (start !== undefined && !MONTH_RE.test(start)) throw new RangeError(`decide change: bad start_month "${start}"`);
  if (end !== undefined && end !== null && !MONTH_RE.test(end)) throw new RangeError(`decide change: bad end_month "${end}"`);
  if (start !== undefined && end !== undefined && end !== null && end < start) {
    throw new RangeError('decide change: end_month is before start_month');
  }
}

function validateAmount(amount: number | undefined): void {
  if (amount === undefined) return;
  if (!Number.isInteger(amount) || amount === 0) throw new RangeError('decide change: monthly_amount must be a non-zero integer');
}

/** Live rows of one household, by start month then creation. */
export async function fetchDecideChanges(client: DbClient, householdId: string): Promise<DecideChangeRow[]> {
  const { data, error, status } = await client
    .from('decide_changes')
    .select(DECIDE_CHANGE_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('start_month', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as DecideChangeRow[] | null) ?? [];
}

async function fetchDecideChange(client: DbClient, id: string): Promise<DecideChangeRow | null> {
  const { data, error, status } = await client.from('decide_changes').select(DECIDE_CHANGE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as DecideChangeRow | null) ?? null;
}

export async function insertDecideChange(client: DbClient, change: NewDecideChange): Promise<DecideChangeRow> {
  assertAllowedKeys(change, DECIDE_CHANGE_INSERT_KEYS, 'insertDecideChange');
  validateAmount(change.monthly_amount);
  validateMonths(change.start_month, change.end_month);

  const row: Record<string, unknown> = {};
  for (const key of DECIDE_CHANGE_INSERT_KEYS) {
    if (change[key] !== undefined) row[key] = change[key];
  }

  const { data, error, status } = await client.from('decide_changes').insert(row).select(DECIDE_CHANGE_COLUMNS).single();
  if (!error) return data as DecideChangeRow;

  // MON-08: a duplicate client id means this exact write already landed (replay).
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchDecideChange(client, change.id);
    if (existing) return existing;
  }
  throw toDbError(error, status);
}

export async function updateDecideChange(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: DecideChangePatch
): Promise<DecideChangeRow> {
  assertAllowedKeys(patch, DECIDE_CHANGE_PATCH_KEYS, 'updateDecideChange');
  validateAmount(patch.monthly_amount);
  validateMonths(patch.start_month, patch.end_month);

  const { data, error, status } = await client
    .from('decide_changes')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(DECIDE_CHANGE_COLUMNS);

  if (error) throw toDbError(error, status);

  const rows = (data as DecideChangeRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as DecideChangeRow;

  const serverRow = await fetchDecideChange(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
