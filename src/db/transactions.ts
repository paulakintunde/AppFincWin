// Typed transaction reads and version-conditional writes (MON-06, MON-14, D-16, D-18).
//
// Every function takes `client: DbClient` as its first parameter -- this file never
// imports the real Supabase client (src/services/supabase), so its tests never trigger
// that module's eager getEnv() call and can run against a fake client instead.

import { FunctionsFetchError } from '@supabase/supabase-js';
import { monthRange } from '@/engine/time';
import { DbError, NotFoundError, VersionConflictError, toDbError } from './errors';
import {
  assertAllowedKeys,
  type DbClient,
  type NewTransaction,
  type TransactionPatch,
  type TransactionRow,
} from './rows';

// Mirrors supabase/migrations/20260924000400_transactions.sql's insert/update grants
// exactly. Every FX stamp column (rate, rate_date, rate_source, home_amount,
// home_currency, orig_per_eur, home_per_eur, rate_pending) is server-only (D-16) and
// excluded from both lists -- a client payload naming one fails 42501 before any trigger
// runs, and assertAllowedKeys rejects it here first.
export const TRANSACTION_INSERT_KEYS = [
  'id',
  'household_id',
  'account_id',
  'original_amount',
  'original_currency',
  'local_date',
  'time_zone',
  'note',
] as const satisfies readonly (keyof NewTransaction)[];

export const TRANSACTION_PATCH_KEYS = [
  'account_id',
  'original_amount',
  'original_currency',
  'local_date',
  'time_zone',
  'note',
] as const satisfies readonly (keyof TransactionPatch)[];

// Casting rate/orig_per_eur/home_per_eur to text keeps them out of JS float arithmetic on
// the way in from Postgres's `numeric` type (MON-01) -- callers parse the string
// themselves via engine/money, never `parseFloat`.
export const TRANSACTION_COLUMNS =
  'id, household_id, account_id, created_by, original_amount, original_currency, home_currency, home_amount, rate:rate::text, orig_per_eur:orig_per_eur::text, home_per_eur:home_per_eur::text, rate_date, rate_source, rate_pending, local_date, time_zone, note, version, created_at, updated_at';

const ENTITY = 'transactions' as const;

/** Postgres/PostgREST unique-violation code -- a duplicate client-generated UUID (MON-08). */
const UNIQUE_VIOLATION = '23505';

export async function fetchTransaction(client: DbClient, id: string): Promise<TransactionRow | null> {
  const { data, error, status } = await client
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw toDbError(error, status);
  return (data as TransactionRow | null) ?? null;
}

/**
 * WR-A12: rows per request when reading a month. Matches PostgREST's hosted default
 * `max_rows` (1000). The loop below does not rely on it being exact: it pages until the
 * exact row count reported with the first page has been read.
 */
export const MONTH_PAGE_SIZE = 1000;

/** WR-A12: a month read returned fewer rows than the server said exist. */
export const TRUNCATED_READ = 'read-truncated';

export async function fetchTransactionsForMonth(
  client: DbClient,
  householdId: string,
  month: string
): Promise<TransactionRow[]> {
  const { start, endExclusive } = monthRange(month);

  // WR-A12: an unpaged read is silently capped at PostgREST's max_rows, which would
  // truncate every total derived from the month (and Decide's inputs) with no error. Pages
  // are requested until the exact count from the first page is reached; `id` is the final
  // sort key so the page boundaries are stable when local_date and created_at tie.
  const rows: TransactionRow[] = [];
  let total: number | null = null;
  for (let from = 0; ; from += MONTH_PAGE_SIZE) {
    const { data, error, status, count } = await client
      .from('transactions')
      .select(TRANSACTION_COLUMNS, from === 0 ? { count: 'exact' } : undefined)
      .eq('household_id', householdId)
      .gte('local_date', start)
      .lt('local_date', endExclusive)
      .order('local_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + MONTH_PAGE_SIZE - 1);

    if (error) throw toDbError(error, status);
    const page = (data as TransactionRow[] | null) ?? [];
    if (from === 0) total = count ?? null;
    rows.push(...page);

    const done = total === null ? page.length < MONTH_PAGE_SIZE : rows.length >= total || page.length === 0;
    if (done) break;
  }

  if (total !== null && rows.length < total) {
    // Rows were removed between pages (or the server capped a page below our page size and
    // then returned nothing). Fail the read rather than serve a short month as complete.
    throw new DbError(`month read incomplete: ${rows.length} of ${total} rows`, TRUNCATED_READ, null);
  }
  return rows;
}

export async function insertTransaction(client: DbClient, tx: NewTransaction): Promise<TransactionRow> {
  const row: Record<string, unknown> = {};
  for (const key of TRANSACTION_INSERT_KEYS) row[key] = tx[key];

  const { data, error, status } = await client.from('transactions').insert(row).select(TRANSACTION_COLUMNS).single();

  if (!error) return data as TransactionRow;

  // MON-08: a duplicate client-generated id means this exact write already landed (a
  // retried mutation, or the paused-mutation queue replaying after a flaky first attempt
  // that actually succeeded) -- the existing row is the correct result, not a failure.
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchTransaction(client, tx.id);
    if (existing) return existing;
    // CR-A03: the violated constraint is not this row's id (e.g. a (owner_id, code) clash
    // from another device). Rethrown as a 23505 DbError, which classifyWriteError treats as
    // a permanent rejection so the write is parked in the failed list, never dropped.
  }

  throw toDbError(error, status);
}

export async function updateTransaction(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: TransactionPatch
): Promise<TransactionRow> {
  assertAllowedKeys(patch, TRANSACTION_PATCH_KEYS, 'updateTransaction');

  const { data, error, status } = await client
    .from('transactions')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(TRANSACTION_COLUMNS);

  if (error) throw toDbError(error, status);

  const rows = (data as TransactionRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as TransactionRow;

  // D-18: zero rows back means either the row moved to a different version (someone
  // else's write landed first -- VersionConflictError, server copy wins) or it no longer
  // exists at all (NotFoundError). Distinguish by looking the row up again.
  const serverRow = await fetchTransaction(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}

/**
 * D-17: calls the resolve-rate Edge Function so a `rate_pending` row (no history existed
 * yet for its currency/date) gets backfilled and re-stamped. A network-layer failure
 * (`FunctionsFetchError`) is transient and rethrown so the caller's retry policy handles
 * it; any HTTP-layer failure the function itself returned is swallowed to `null` -- the
 * row stays `rate_pending` and a later call (or the background restamp path) can retry.
 */
/**
 * WR-A15: upper bound on one resolve-rate call. The call is best-effort (a row that stays
 * rate_pending is picked up later), so a slow upstream backfill must never hang a caller.
 */
export const RATE_RESOLUTION_TIMEOUT_MS = 15_000;

export async function requestRateResolution(client: DbClient, transactionId: string): Promise<TransactionRow | null> {
  const { data, error } = await client.functions.invoke('resolve-rate', {
    body: { transactionId },
    timeout: RATE_RESOLUTION_TIMEOUT_MS,
  });

  if (error) {
    if (error instanceof FunctionsFetchError) throw error;
    return null;
  }

  const row = (data as { row?: TransactionRow } | null)?.row;
  return row ?? null;
}
