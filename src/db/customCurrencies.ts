// Typed custom-currency reads and writes (MON-04, MON-13, D-07). Same shape as
// accounts.ts/transactions.ts: client-injected, version-conditional update, duplicate-id-safe
// insert. CUSTOM_CURRENCY_COLUMNS/assertAllowedKeys come from rows.ts (01-10), matching the
// grants in supabase/migrations/20260924000100_custom_currencies.sql exactly.

import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, CUSTOM_CURRENCY_COLUMNS, type CustomCurrencyRow, type DbClient } from './rows';

export interface NewCustomCurrency {
  id: string;
  code: string;
  symbol: string;
  decimals: number;
  reference_currency: string;
  unit_value: string;
  as_of: string;
}

export type CustomCurrencyPatch = Partial<
  Pick<CustomCurrencyRow, 'symbol' | 'reference_currency' | 'unit_value' | 'as_of'>
>;

// Mirrors the migration's insert grant: id, code, symbol, decimals, reference_currency,
// unit_value, as_of -- 7 keys, code/decimals immutable after creation (D-07).
export const CUSTOM_CURRENCY_INSERT_KEYS = [
  'id',
  'code',
  'symbol',
  'decimals',
  'reference_currency',
  'unit_value',
  'as_of',
] as const satisfies readonly (keyof NewCustomCurrency)[];

// Mirrors the migration's update grant: symbol, reference_currency, unit_value, as_of.
export const CUSTOM_CURRENCY_PATCH_KEYS = [
  'symbol',
  'reference_currency',
  'unit_value',
  'as_of',
] as const satisfies readonly (keyof CustomCurrencyPatch)[];

const ENTITY = 'custom_currencies' as const;

/** Postgres/PostgREST unique-violation code -- a duplicate client-generated UUID (MON-08). */
const UNIQUE_VIOLATION = '23505';

export async function fetchCustomCurrency(client: DbClient, id: string): Promise<CustomCurrencyRow | null> {
  const { data, error, status } = await client
    .from('custom_currencies')
    .select(CUSTOM_CURRENCY_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as CustomCurrencyRow | null) ?? null;
}

export async function fetchCustomCurrencies(client: DbClient, ownerId: string): Promise<CustomCurrencyRow[]> {
  const { data, error, status } = await client
    .from('custom_currencies')
    .select(CUSTOM_CURRENCY_COLUMNS)
    .eq('owner_id', ownerId)
    .order('code', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as CustomCurrencyRow[] | null) ?? [];
}

export async function insertCustomCurrency(client: DbClient, currency: NewCustomCurrency): Promise<CustomCurrencyRow> {
  const row: Record<string, unknown> = {};
  for (const key of CUSTOM_CURRENCY_INSERT_KEYS) row[key] = currency[key];

  const { data, error, status } = await client
    .from('custom_currencies')
    .insert(row)
    .select(CUSTOM_CURRENCY_COLUMNS)
    .single();

  if (!error) return data as CustomCurrencyRow;

  // MON-08: a duplicate client-generated id means this exact write already landed (a retried
  // mutation, or the paused-mutation queue replaying after a flaky first attempt that
  // actually succeeded) -- the existing row is the correct result, not a failure.
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchCustomCurrency(client, currency.id);
    if (existing) return existing;
  }

  throw toDbError(error, status);
}

export async function updateCustomCurrency(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: CustomCurrencyPatch
): Promise<CustomCurrencyRow> {
  assertAllowedKeys(patch, CUSTOM_CURRENCY_PATCH_KEYS, 'updateCustomCurrency');

  const { data, error, status } = await client
    .from('custom_currencies')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(CUSTOM_CURRENCY_COLUMNS);

  if (error) throw toDbError(error, status);

  const rows = (data as CustomCurrencyRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as CustomCurrencyRow;

  // D-18: zero rows back means either the row moved to a different version (a conflicting
  // edit landed first -- VersionConflictError, server copy wins) or it no longer exists at
  // all (NotFoundError). Distinguish by looking the row up again.
  const serverRow = await fetchCustomCurrency(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
