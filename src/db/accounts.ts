// Typed account reads and version-conditional writes (MON-08, MON-09, D-18). Same shape as
// transactions.ts: every function takes `client: DbClient` first, no real-client import.

import { NotFoundError, VersionConflictError, toDbError } from './errors';
import {
  assertAllowedKeys,
  type AccountPatch,
  type AccountRow,
  type DbClient,
  type NewAccount,
} from './rows';

// Mirrors supabase/migrations/20260924000300_accounts.sql's insert/update grants exactly.
// currency is fixed at creation and excluded from the update grant.
export const ACCOUNT_INSERT_KEYS = [
  'id',
  'household_id',
  'name',
  'kind',
  'currency',
  'opening_balance',
] as const satisfies readonly (keyof NewAccount)[];

export const ACCOUNT_PATCH_KEYS = [
  'name',
  'kind',
  'opening_balance',
  'archived_at',
] as const satisfies readonly (keyof AccountPatch)[];

export const ACCOUNT_COLUMNS =
  'id, household_id, created_by, name, kind, currency, opening_balance, archived_at, version, created_at, updated_at';

const ENTITY = 'accounts' as const;

const UNIQUE_VIOLATION = '23505';

export async function fetchAccount(client: DbClient, id: string): Promise<AccountRow | null> {
  const { data, error, status } = await client.from('accounts').select(ACCOUNT_COLUMNS).eq('id', id).maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as AccountRow | null) ?? null;
}

export async function fetchAccounts(client: DbClient, householdId: string): Promise<AccountRow[]> {
  const { data, error, status } = await client
    .from('accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('household_id', householdId)
    .order('name', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as AccountRow[] | null) ?? [];
}

export async function insertAccount(client: DbClient, account: NewAccount): Promise<AccountRow> {
  const row: Record<string, unknown> = {};
  for (const key of ACCOUNT_INSERT_KEYS) row[key] = account[key];

  const { data, error, status } = await client.from('accounts').insert(row).select(ACCOUNT_COLUMNS).single();

  if (!error) return data as AccountRow;

  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchAccount(client, account.id);
    if (existing) return existing;
    // CR-A03: the violated constraint is not this row's id (e.g. a (owner_id, code) clash
    // from another device). Rethrown as a 23505 DbError, which classifyWriteError treats as
    // a permanent rejection so the write is parked in the failed list, never dropped.
  }

  throw toDbError(error, status);
}

export async function updateAccount(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: AccountPatch
): Promise<AccountRow> {
  assertAllowedKeys(patch, ACCOUNT_PATCH_KEYS, 'updateAccount');

  const { data, error, status } = await client
    .from('accounts')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(ACCOUNT_COLUMNS);

  if (error) throw toDbError(error, status);

  const rows = (data as AccountRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as AccountRow;

  const serverRow = await fetchAccount(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
