// 05-05: typed reads and writes for debts (05-03). Key lists mirror the SQL grants exactly:
// check_id and is_sample are written only by record_decide_go / sample data, never from a client payload.

import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export interface DebtRow {
  id: string;
  household_id: string;
  account_id: string | null;
  check_id: string | null;
  series_id: string | null;
  name: string;
  kind: 'loan' | 'card' | 'other';
  currency: string;
  balance: number;
  apr: string | null;
  minimum_payment: number;
  secured: boolean;
  term_months: number | null;
  start_date: string | null;
  min_percent: string | null;
  min_interest_added: boolean | null;
  min_floor: number | null;
  paid_in_full: boolean; // D-38 / D-40
  pays_in_full?: 'yes' | 'sometimes' | 'no' | null; // 05.2: card payment habit (20261028000500)
  is_housing: boolean; // D-103: counts toward the housing line; update grant only, the guard sets it on insert
  is_sample: boolean;
  deleted_at: string | null;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const DEBT_COLUMNS =
  'id, household_id, account_id, check_id, series_id, name, kind, currency, balance, apr, minimum_payment, secured, term_months, start_date, min_percent, min_interest_added, min_floor, paid_in_full, pays_in_full, is_housing, is_sample, deleted_at, version, updated_by, created_at, updated_at';

export type NewDebt = Pick<
  DebtRow,
  | 'id'
  | 'household_id'
  | 'account_id'
  | 'series_id'
  | 'name'
  | 'kind'
  | 'currency'
  | 'balance'
  | 'apr'
  | 'minimum_payment'
  | 'secured'
  | 'term_months'
  | 'start_date'
  | 'min_percent'
  | 'min_interest_added'
  | 'min_floor'
  | 'paid_in_full'
  | 'pays_in_full'
>;

export type DebtPatch = Partial<
  Pick<
    DebtRow,
    | 'account_id'
    | 'series_id'
    | 'name'
    | 'balance'
    | 'apr'
    | 'minimum_payment'
    | 'secured'
    | 'term_months'
    | 'min_percent'
    | 'min_interest_added'
    | 'min_floor'
    | 'paid_in_full'
    | 'pays_in_full'
    | 'is_housing'
    | 'deleted_at'
  >
>;

export const DEBT_INSERT_KEYS = [
  'id',
  'household_id',
  'account_id',
  'series_id',
  'name',
  'kind',
  'currency',
  'balance',
  'apr',
  'minimum_payment',
  'secured',
  'term_months',
  'start_date',
  'min_percent',
  'min_interest_added',
  'min_floor',
  'paid_in_full',
  'pays_in_full',
] as const satisfies readonly (keyof NewDebt)[];

export const DEBT_PATCH_KEYS = [
  'account_id',
  'series_id',
  'name',
  'balance',
  'apr',
  'minimum_payment',
  'secured',
  'term_months',
  'min_percent',
  'min_interest_added',
  'min_floor',
  'paid_in_full',
  'pays_in_full',
  'is_housing',
  'deleted_at',
] as const satisfies readonly (keyof DebtPatch)[];

const ENTITY = 'debts' as const;
const UNIQUE_VIOLATION = '23505';

/** Live debts of one household (WR-A05: RLS alone would return every household the caller belongs to). */
export async function fetchDebts(client: DbClient, householdId: string): Promise<DebtRow[]> {
  const { data, error, status } = await client
    .from('debts')
    .select(DEBT_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as DebtRow[] | null) ?? [];
}

async function fetchDebt(client: DbClient, id: string): Promise<DebtRow | null> {
  const { data, error, status } = await client.from('debts').select(DEBT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as DebtRow | null) ?? null;
}

export async function insertDebt(client: DbClient, row: NewDebt): Promise<DebtRow> {
  assertAllowedKeys(row as unknown as Record<string, unknown>, DEBT_INSERT_KEYS, 'insertDebt');

  const { data, error, status } = await client.from('debts').insert(row).select(DEBT_COLUMNS).single();
  if (!error) return data as DebtRow;

  // MON-08: a duplicate client id means this exact write already landed (replay).
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchDebt(client, row.id);
    if (existing) return existing;
  }
  throw toDbError(error, status);
}

export async function updateDebt(client: DbClient, id: string, expectedVersion: number, patch: DebtPatch): Promise<DebtRow> {
  assertAllowedKeys(patch, DEBT_PATCH_KEYS, 'updateDebt');

  const { data, error, status } = await client
    .from('debts')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(DEBT_COLUMNS);

  if (error) throw toDbError(error, status);
  const rows = (data as DebtRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as DebtRow;

  const serverRow = await fetchDebt(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
