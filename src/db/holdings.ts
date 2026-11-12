// 06 Grow (GRW-10): typed reads and writes for investment holdings (owner-private, 20261106000100).
// Key lists mirror the SQL grants exactly. `value` and `value_as_of` are written on insert only: after that the
// guard freezes them, and the current value moves through a 'value' entry in holding_lots (the server syncs it).
// currency, is_sample and created_by are never client payload.

import { NotFoundError, VersionConflictError, toDbError, type WriteEntity } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export type HoldingType = 'brokerage' | 'retirement' | 'pension' | 'crypto' | 'other';

export interface HoldingRow {
  id: string;
  household_id: string;
  created_by: string;
  updated_by: string | null;
  name: string;
  type: HoldingType;
  currency: string;
  value: number; // minor units, the latest known value
  value_as_of: string; // date the value was last given
  opening_put_in: number; // minor units put in before the first entry
  account_id: string | null;
  paid_from_account_id: string | null;
  monthly_amount: number | null;
  day: number | null; // 1..31
  rate: string | null; // expected growth, a percent string
  is_sample: boolean;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export const HOLDING_COLUMNS =
  'id, household_id, created_by, updated_by, name, type, currency, value, value_as_of, opening_put_in, account_id, paid_from_account_id, monthly_amount, day, rate, is_sample, deleted_at, version, created_at, updated_at';

export type NewHolding = Pick<HoldingRow, 'id' | 'household_id' | 'name' | 'type' | 'currency' | 'value' | 'value_as_of'> &
  Partial<Pick<HoldingRow, 'opening_put_in' | 'account_id' | 'paid_from_account_id' | 'monthly_amount' | 'day' | 'rate'>>;

export type HoldingPatch = Partial<
  Pick<
    HoldingRow,
    'name' | 'type' | 'opening_put_in' | 'account_id' | 'paid_from_account_id' | 'monthly_amount' | 'day' | 'rate' | 'deleted_at'
  >
>;

export const HOLDING_INSERT_KEYS = [
  'id',
  'household_id',
  'name',
  'type',
  'currency',
  'value',
  'value_as_of',
  'opening_put_in',
  'account_id',
  'paid_from_account_id',
  'monthly_amount',
  'day',
  'rate',
] as const satisfies readonly (keyof NewHolding)[];

export const HOLDING_PATCH_KEYS = [
  'name',
  'type',
  'opening_put_in',
  'account_id',
  'paid_from_account_id',
  'monthly_amount',
  'day',
  'rate',
  'deleted_at',
] as const satisfies readonly (keyof HoldingPatch)[];

// Registered in WriteEntity by plan 06-09; the cast keeps this module compiling on its own until both land.
const ENTITY: WriteEntity = 'holdings';
const UNIQUE_VIOLATION = '23505';

/** Live holdings of one household, oldest first. */
export async function fetchHoldings(client: DbClient, householdId: string): Promise<HoldingRow[]> {
  const { data, error, status } = await client
    .from('holdings')
    .select(HOLDING_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as HoldingRow[] | null) ?? [];
}

async function fetchHolding(client: DbClient, id: string): Promise<HoldingRow | null> {
  const { data, error, status } = await client.from('holdings').select(HOLDING_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as HoldingRow | null) ?? null;
}

/** A duplicate client id means this exact write already landed (MON-08), so it reads back as the existing row. */
export async function insertHolding(client: DbClient, row: NewHolding): Promise<HoldingRow> {
  assertAllowedKeys(row as unknown as Record<string, unknown>, HOLDING_INSERT_KEYS, 'insertHolding');

  const { data, error, status } = await client.from('holdings').insert(row).select(HOLDING_COLUMNS).single();
  if (!error) return data as HoldingRow;

  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchHolding(client, row.id);
    if (existing) return existing;
  }
  throw toDbError(error, status);
}

export async function updateHolding(client: DbClient, id: string, expectedVersion: number, patch: HoldingPatch): Promise<HoldingRow> {
  assertAllowedKeys(patch, HOLDING_PATCH_KEYS, 'updateHolding');

  const { data, error, status } = await client
    .from('holdings')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(HOLDING_COLUMNS);

  if (error) throw toDbError(error, status);
  const rows = (data as HoldingRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as HoldingRow;

  const serverRow = await fetchHolding(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
