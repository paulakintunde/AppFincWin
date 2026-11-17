// Soft-deleted accounts (D-24, RESEARCH Open Question 6) read as not found: fetchAccounts and
// fetchAccount filter deleted_at, so every consumer drops them.
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
  'overdraft_limit',
  'credit_limit',
  'use',
  'use_purpose',
  'use_envelope_id',
  'use_extra_set_aside',
  'overdraft_rate',
  'interest_rate',
  'is_shared', // 08-01 grant (joint account, D-13)
] as const satisfies readonly (keyof NewAccount)[];

export const ACCOUNT_PATCH_KEYS = [
  'name',
  'kind',
  'opening_balance',
  'archived_at',
  'overdraft_limit',
  'credit_limit',
  'deleted_at',
  'use',
  'use_purpose',
  'use_envelope_id',
  'use_extra_set_aside',
  'overdraft_rate',
  'interest_rate',
  'is_shared',
] as const satisfies readonly (keyof AccountPatch)[];

export const ACCOUNT_COLUMNS =
  'id, household_id, created_by, name, kind, currency, opening_balance, archived_at, updated_by, overdraft_limit, credit_limit, use, use_purpose, use_envelope_id, use_extra_set_aside, overdraft_rate, interest_rate, is_shared, tombstone_of, deleted_at, is_sample, version, created_at, updated_at';

const ENTITY = 'accounts' as const;

const UNIQUE_VIOLATION = '23505';

export async function fetchAccount(client: DbClient, id: string): Promise<AccountRow | null> {
  const { data, error, status } = await client.from('accounts').select(ACCOUNT_COLUMNS).eq('id', id).is('deleted_at', null).maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as AccountRow | null) ?? null;
}

export async function fetchAccounts(client: DbClient, householdId: string): Promise<AccountRow[]> {
  const { data, error, status } = await client
    .from('accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .is('tombstone_of', null) // 08-14: an account that only holds a departed member's shared lines never shows in a list or picker
    .order('name', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as AccountRow[] | null) ?? [];
}

export async function insertAccount(client: DbClient, account: NewAccount): Promise<AccountRow> {
  const row: Record<string, unknown> = {};
  // An old caller never sets overdraft_limit/credit_limit -- skip undefined so it never sends
  // them at all, rather than sending an explicit null it never asked for.
  for (const key of ACCOUNT_INSERT_KEYS) {
    if (account[key] !== undefined) row[key] = account[key];
  }

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

export interface AccountUsageCounts {
  liveLineCount: number;
  activeSeriesCount: number;
}

/**
 * REC-24, CONTEXT D-24: how many live lines and active repeating lines use an account.
 * Head counts only (no row data); RLS scopes them to the caller's household.
 */
export async function fetchAccountUsageCounts(
  client: DbClient,
  householdId: string,
  accountId: string,
  today: string
): Promise<AccountUsageCounts> {
  const lines = await client
    .from('transactions_active')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('account_id', accountId);
  if (lines.error) throw toDbError(lines.error, lines.status);

  const seriesBase = () =>
    client
      .from('recurring_series')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .eq('account_id', accountId)
      .is('deleted_at', null);
  // Active = no end date, or an end date that has not passed.
  const open = await seriesBase().is('end_date', null);
  if (open.error) throw toDbError(open.error, open.status);
  const future = await seriesBase().gte('end_date', today);
  if (future.error) throw toDbError(future.error, future.status);

  return { liveLineCount: lines.count ?? 0, activeSeriesCount: (open.count ?? 0) + (future.count ?? 0) };
}

/**
 * 08-15 (D-17): ids of the household's joint accounts. A line paid from one creates no owing. A tombstone account (08-14) is
 * shared only so a departed member's lines keep a home; it is NOT joint for owing, so it is left out here. Soft-deleted
 * accounts are kept: a line on one is still a line on a joint account.
 */
export async function fetchJointAccountIds(client: DbClient, householdId: string): Promise<string[]> {
  const { data, error, status } = await client
    .from('accounts')
    .select('id')
    .eq('household_id', householdId)
    .eq('is_shared', true)
    .is('tombstone_of', null);

  if (error) throw toDbError(error, status);
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}
