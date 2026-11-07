// 06 Grow (GRW-10): typed reads and writes for holding entries (buy, sell, dividend, fee, value), owner-private
// (20261106000100). Key lists mirror the SQL grants exactly: kind and holding_id are fixed once written.

import { NotFoundError, VersionConflictError, toDbError, type WriteEntity } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export type HoldingLotKind = 'buy' | 'sell' | 'dividend' | 'fee' | 'value';

export interface HoldingLotRow {
  id: string;
  holding_id: string;
  household_id: string;
  created_by: string;
  updated_by: string | null;
  kind: HoldingLotKind;
  amount: number; // minor units; for kind 'value' the new total value
  units: string | null; // decimal string, up to 8 places
  local_date: string;
  note: string | null;
  is_sample: boolean;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export const HOLDING_LOT_COLUMNS =
  'id, holding_id, household_id, created_by, updated_by, kind, amount, units, local_date, note, is_sample, deleted_at, version, created_at, updated_at';

export type NewHoldingLot = Pick<HoldingLotRow, 'id' | 'holding_id' | 'household_id' | 'kind' | 'amount' | 'local_date'> &
  Partial<Pick<HoldingLotRow, 'units' | 'note'>>;

export type HoldingLotPatch = Partial<Pick<HoldingLotRow, 'amount' | 'units' | 'local_date' | 'note' | 'deleted_at'>>;

export const HOLDING_LOT_INSERT_KEYS = [
  'id',
  'holding_id',
  'household_id',
  'kind',
  'amount',
  'units',
  'local_date',
  'note',
] as const satisfies readonly (keyof NewHoldingLot)[];

export const HOLDING_LOT_PATCH_KEYS = [
  'amount',
  'units',
  'local_date',
  'note',
  'deleted_at',
] as const satisfies readonly (keyof HoldingLotPatch)[];

// Registered in WriteEntity by plan 06-09; the cast keeps this module compiling on its own until both land.
const ENTITY = 'holding_lots' as unknown as WriteEntity;
const UNIQUE_VIOLATION = '23505';

/** Live entries of one household, by date then creation order. */
export async function fetchHoldingLots(client: DbClient, householdId: string): Promise<HoldingLotRow[]> {
  const { data, error, status } = await client
    .from('holding_lots')
    .select(HOLDING_LOT_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('local_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as HoldingLotRow[] | null) ?? [];
}

async function fetchHoldingLot(client: DbClient, id: string): Promise<HoldingLotRow | null> {
  const { data, error, status } = await client.from('holding_lots').select(HOLDING_LOT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as HoldingLotRow | null) ?? null;
}

/** A duplicate client id means this exact write already landed (MON-08), so it reads back as the existing row. */
export async function insertHoldingLot(client: DbClient, row: NewHoldingLot): Promise<HoldingLotRow> {
  assertAllowedKeys(row as unknown as Record<string, unknown>, HOLDING_LOT_INSERT_KEYS, 'insertHoldingLot');

  const { data, error, status } = await client.from('holding_lots').insert(row).select(HOLDING_LOT_COLUMNS).single();
  if (!error) return data as HoldingLotRow;

  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchHoldingLot(client, row.id);
    if (existing) return existing;
  }
  throw toDbError(error, status);
}

export async function updateHoldingLot(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: HoldingLotPatch
): Promise<HoldingLotRow> {
  assertAllowedKeys(patch, HOLDING_LOT_PATCH_KEYS, 'updateHoldingLot');

  const { data, error, status } = await client
    .from('holding_lots')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(HOLDING_LOT_COLUMNS);

  if (error) throw toDbError(error, status);
  const rows = (data as HoldingLotRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as HoldingLotRow;

  const serverRow = await fetchHoldingLot(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
