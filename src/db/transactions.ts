// Typed transaction reads and version-conditional writes (MON-06, MON-14, D-16, D-18).
//
// Every function takes `client: DbClient` as its first parameter -- this file never
// imports the real Supabase client (src/services/supabase), so its tests never trigger
// that module's eager getEnv() call and can run against a fake client instead.

import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { monthRange } from '@/engine/time';
import { noteResolveRateThrottled } from '@/data/sync/resolveRateBackoff';
import { DbError, NotFoundError, VersionConflictError, toDbError } from './errors';
import {
  assertAllowedKeys,
  type DbClient,
  type NewTransaction,
  type PaymentType,
  type TransactionPatch,
  type TransactionRow,
} from './rows';

// D-30: every client read path uses the soft-delete-filtering view, never the raw table --
// a tombstoned row must never appear in a month, a search or a count. fetchTransaction is the
// one deliberate exception: a conflict lookup (insert-duplicate, update-version-mismatch) must
// still see a row that was soft-deleted since the caller last read it.
export const ACTIVE_VIEW = 'transactions_active';

// Mirrors supabase/migrations/20260924000400_transactions.sql's insert/update grants
// exactly. Every FX stamp column (rate, rate_date, rate_source, home_amount,
// home_currency, orig_per_eur, home_per_eur, orig_custom_unit_value,
// orig_custom_ref_per_eur, home_custom_unit_value, home_custom_ref_per_eur, rate_pending)
// is server-only (D-16) and excluded from both lists -- a client payload naming one fails
// 42501 before any trigger runs, and assertAllowedKeys rejects it here first. The four
// custom-leg stamp columns ARE included in TRANSACTION_COLUMNS below (RD-03 follow-up):
// they are readable under the table's existing whole-table SELECT grant even though they
// stay absent from both write-key lists above -- server-written, client-read-only.
export const TRANSACTION_INSERT_KEYS = [
  'id',
  'household_id',
  'account_id',
  'original_amount',
  'original_currency',
  'local_date',
  'time_zone',
  'note',
  'name',
  'category_id',
  'payment_type',
  'status',
  'import_batch_id',
  'raw_amount',
  'raw_balance',
  'external_id',
  'import_format',
  'transfer_id',
] as const satisfies readonly (keyof NewTransaction)[];

// D-45: raw_amount/raw_balance/external_id/import_format are insert-only provenance and are
// deliberately absent here -- assertAllowedKeys catches a provenance edit before the server
// does. transfer_id IS patchable (editing/deleting a transfer touches both legs, D-50/D-51).
// recurring_series_id/occurrence_date/updated_by are server-only and never appear in either
// write-key list -- they are select-only columns in TRANSACTION_COLUMNS below.
export const TRANSACTION_PATCH_KEYS = [
  'account_id',
  'original_amount',
  'original_currency',
  'local_date',
  'time_zone',
  'note',
  'name',
  'category_id',
  'payment_type',
  'status',
  'deleted_at',
  'transfer_id',
] as const satisfies readonly (keyof TransactionPatch)[];

// Casting rate/orig_per_eur/home_per_eur/the four custom-leg stamp columns to text keeps
// them out of JS float arithmetic on the way in from Postgres's `numeric` type (MON-01) --
// callers parse the string themselves via engine/money, never `parseFloat`.
export const TRANSACTION_COLUMNS =
  'id, household_id, account_id, created_by, original_amount, original_currency, home_currency, home_amount, rate:rate::text, orig_per_eur:orig_per_eur::text, home_per_eur:home_per_eur::text, orig_custom_unit_value:orig_custom_unit_value::text, orig_custom_ref_per_eur:orig_custom_ref_per_eur::text, home_custom_unit_value:home_custom_unit_value::text, home_custom_ref_per_eur:home_custom_ref_per_eur::text, rate_date, rate_source, rate_pending, local_date, time_zone, note, name, category_id, payment_type, status, deleted_at, import_batch_id, recurring_series_id, occurrence_date, updated_by, raw_amount, raw_balance, external_id, import_format, transfer_id, version, created_at, updated_at';

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

interface PageResponse<T> {
  data: T[] | null;
  error: { message: string; code?: string | null } | null;
  status: number;
  count?: number | null;
}

/**
 * WR-A12's paging loop, generalised so every unbounded read (month, date range, ...) shares
 * it: an unpaged read is silently capped at PostgREST's max_rows, which would truncate any
 * total derived from it with no error. `build` is called with the current page offset and
 * whether this is the first page (which must ask for an exact count); pages are requested
 * until the exact row count reported with the first page has been read.
 */
async function fetchAllPages<T>(build: (from: number, withCount: boolean) => PromiseLike<PageResponse<T>>): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;
  for (let from = 0; ; from += MONTH_PAGE_SIZE) {
    const { data, error, status, count } = await build(from, from === 0);

    if (error) throw toDbError(error, status);
    const page = data ?? [];
    if (from === 0) total = count ?? null;
    rows.push(...page);

    const done = total === null ? page.length < MONTH_PAGE_SIZE : rows.length >= total || page.length === 0;
    if (done) break;
  }

  if (total !== null && rows.length < total) {
    // Rows were removed between pages (or the server capped a page below our page size and
    // then returned nothing). Fail the read rather than serve a short read as complete.
    throw new DbError(`read incomplete: ${rows.length} of ${total} rows`, TRUNCATED_READ, null);
  }
  return rows;
}

export async function fetchTransactionsForMonth(
  client: DbClient,
  householdId: string,
  month: string
): Promise<TransactionRow[]> {
  const { start, endExclusive } = monthRange(month);

  // D-30: reads the soft-delete-filtering view, not the raw table -- a tombstoned row must
  // never appear in a month total. `id` is the final sort key so page boundaries are stable
  // when local_date and created_at tie.
  return fetchAllPages<TransactionRow>((from, withCount) =>
    client
      .from(ACTIVE_VIEW)
      .select(TRANSACTION_COLUMNS, withCount ? { count: 'exact' } : undefined)
      .eq('household_id', householdId)
      .gte('local_date', start)
      .lt('local_date', endExclusive)
      .order('local_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + MONTH_PAGE_SIZE - 1)
  );
}

export async function insertTransaction(client: DbClient, tx: NewTransaction): Promise<TransactionRow> {
  const row: Record<string, unknown> = {};
  // Record (Phase 2): most new NewTransaction fields are optional -- skip undefined so an old
  // caller never sends e.g. status: undefined for a column the server defaults itself.
  for (const key of TRANSACTION_INSERT_KEYS) {
    if (tx[key] !== undefined) row[key] = tx[key];
  }

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

/** ACT-03 default cap on a cross-month name search. */
export const SEARCH_LIMIT = 200;

/** Backslash-escapes LIKE/ILIKE metacharacters (\\, %, _) so a search term is never read as a wildcard (T-02-11-03). */
export function escapeLikeTerm(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** ACT-03: searches names across every month, newest first. The term is passed as a PostgREST parameter, never concatenated into SQL. */
export async function fetchTransactionsSearch(
  client: DbClient,
  householdId: string,
  term: string,
  limit = SEARCH_LIMIT
): Promise<TransactionRow[]> {
  const trimmed = term.trim();
  if (trimmed.length === 0) throw new RangeError('fetchTransactionsSearch: term must not be empty');

  const { data, error, status } = await client
    .from(ACTIVE_VIEW)
    .select(TRANSACTION_COLUMNS)
    .eq('household_id', householdId)
    .ilike('name', `%${escapeLikeTerm(trimmed)}%`)
    .order('local_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(limit);

  if (error) throw toDbError(error, status);
  return (data as TransactionRow[] | null) ?? [];
}

/**
 * Reads a date range on the household (optionally narrowed to one account), oldest first --
 * the shape the import pipeline needs for duplicate detection (with external_id/import_format)
 * and pending-bill matching (D-55).
 */
export async function fetchTransactionsInRange(
  client: DbClient,
  householdId: string,
  range: { from: string; toInclusive: string; accountId?: string }
): Promise<TransactionRow[]> {
  return fetchAllPages<TransactionRow>((from, withCount) => {
    const base = client
      .from(ACTIVE_VIEW)
      .select(TRANSACTION_COLUMNS, withCount ? { count: 'exact' } : undefined)
      .eq('household_id', householdId)
      .gte('local_date', range.from)
      .lte('local_date', range.toInclusive);
    const scoped = range.accountId ? base.eq('account_id', range.accountId) : base;
    return scoped
      .order('local_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + MONTH_PAGE_SIZE - 1);
  });
}

/** D-52: a candidate leg for import's transfer detection -- always unlinked (transfer_id null). */
export interface TransferCandidateRow {
  id: string;
  account_id: string;
  local_date: string;
  original_amount: number;
  original_currency: string;
  name: string | null;
  payment_type: PaymentType | null;
  transfer_id: null;
  category_id: string | null;
  version: number;
}

const TRANSFER_CANDIDATE_COLUMNS =
  'id, account_id, local_date, original_amount, original_currency, name, payment_type, transfer_id, category_id, version';

/** D-52: unlinked rows on the user's OTHER accounts in a date window -- import's transfer-candidate search. */
export async function fetchTransferCandidates(
  client: DbClient,
  householdId: string,
  q: { excludeAccountId: string; from: string; toInclusive: string }
): Promise<TransferCandidateRow[]> {
  return fetchAllPages<TransferCandidateRow>((from, withCount) =>
    client
      .from(ACTIVE_VIEW)
      .select(TRANSFER_CANDIDATE_COLUMNS, withCount ? { count: 'exact' } : undefined)
      .eq('household_id', householdId)
      .is('transfer_id', null)
      .neq('account_id', q.excludeAccountId)
      .gte('local_date', q.from)
      .lte('local_date', q.toInclusive)
      .order('local_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + MONTH_PAGE_SIZE - 1)
  );
}

/** RESEARCH §A1 option a: whether the target account has any active row before `beforeDate` -- an OFX reconciliation anchor. */
export async function fetchHasRowsBefore(
  client: DbClient,
  householdId: string,
  accountId: string,
  beforeDate: string
): Promise<boolean> {
  const { data, error, status } = await client
    .from(ACTIVE_VIEW)
    .select('id')
    .eq('household_id', householdId)
    .eq('account_id', accountId)
    .lt('local_date', beforeDate)
    .limit(1);

  if (error) throw toDbError(error, status);
  return ((data as { id: string }[] | null) ?? []).length > 0;
}

/** T-02-11-06: denial-of-service guard on fetchTransferLegs. */
export const TRANSFER_LEGS_MAX = 200;

/** D-50/D-51: both legs of one or more transfers, for edit/delete-both. */
export async function fetchTransferLegs(
  client: DbClient,
  householdId: string,
  transferIds: readonly string[]
): Promise<TransactionRow[]> {
  if (transferIds.length === 0) return [];
  if (transferIds.length > TRANSFER_LEGS_MAX) {
    throw new RangeError(`fetchTransferLegs: ${transferIds.length} ids exceeds TRANSFER_LEGS_MAX (${TRANSFER_LEGS_MAX})`);
  }

  const { data, error, status } = await client
    .from(ACTIVE_VIEW)
    .select(TRANSACTION_COLUMNS)
    .eq('household_id', householdId)
    .in('transfer_id', transferIds);

  if (error) throw toDbError(error, status);
  return (data as TransactionRow[] | null) ?? [];
}

/**
 * Review W6-13 WR-01: the current id/version/deleted_at of specific rows, read from the RAW table
 * (not the soft-delete view) so a replay can tell "landed and untouched" (version 1, live) from
 * "landed and changed since". Used only for small, known id sets (a transfer's two legs).
 */
export async function fetchTransactionVersions(
  client: DbClient,
  householdId: string,
  ids: readonly string[]
): Promise<Pick<TransactionRow, 'id' | 'local_date' | 'version' | 'rate_pending' | 'deleted_at'>[]> {
  if (ids.length === 0) return [];
  if (ids.length > TRANSFER_LEGS_MAX) {
    throw new RangeError(`fetchTransactionVersions: ${ids.length} ids exceeds ${TRANSFER_LEGS_MAX}`);
  }
  const { data, error, status } = await client
    .from('transactions')
    .select('id, local_date, version, rate_pending, deleted_at')
    .eq('household_id', householdId)
    .in('id', ids);

  if (error) throw toDbError(error, status);
  return (data as Pick<TransactionRow, 'id' | 'local_date' | 'version' | 'rate_pending' | 'deleted_at'>[] | null) ?? [];
}

/** D-14: descriptions the user has categorised before, for import's category-guess learning. */
export async function fetchCategorisedNames(
  client: DbClient,
  householdId: string,
  userId: string,
  limit = 5000
): Promise<{ name: string; category_id: string; updated_at: string }[]> {
  const { data, error, status } = await client
    .from(ACTIVE_VIEW)
    .select('name, category_id, updated_at')
    .eq('household_id', householdId)
    .eq('created_by', userId)
    .not('category_id', 'is', null)
    .not('name', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw toDbError(error, status);
  return (data as { name: string; category_id: string; updated_at: string }[] | null) ?? [];
}

/** D-36: denial-of-service guard on a category merge -- callers detect overflow via length > MERGE_LIMIT. */
export const MERGE_LIMIT = 6000;

/**
 * Review W6-13 WR-03: the most transaction rows one merge can move. MERGE_LIMIT is the op cap of
 * one apply_patches call (and of buildStep), and a merge always adds one op to archive the source
 * category, so at most MERGE_LIMIT - 1 rows fit. Use this for "can this be merged" checks.
 */
export const MERGE_ROWS_MAX = MERGE_LIMIT - 1;

/** D-36: every active row's id/version/local_date in one category, for a category merge. */
export async function fetchActiveIdsByCategory(
  client: DbClient,
  householdId: string,
  categoryId: string
): Promise<{ id: string; version: number; local_date: string }[]> {
  const { data, error, status } = await client
    .from(ACTIVE_VIEW)
    .select('id, version, local_date')
    .eq('household_id', householdId)
    .eq('category_id', categoryId)
    .limit(MERGE_LIMIT + 1);

  if (error) throw toDbError(error, status);
  return (data as { id: string; version: number; local_date: string }[] | null) ?? [];
}

/** T-02-11-04: denial-of-service guard on one import chunk. */
export const IMPORT_CHUNK_MAX = 500;

/**
 * D-17/MON-08: inserts an import chunk in one request. `ON CONFLICT DO NOTHING` (via
 * `ignoreDuplicates`) needs only the insert grant, so a replayed chunk (the paused-mutation
 * queue retrying after a flaky first attempt that actually landed) returns only the rows that
 * were genuinely new.
 */
export async function insertTransactionsBatch(
  client: DbClient,
  rows: readonly NewTransaction[]
): Promise<Pick<TransactionRow, 'id' | 'local_date' | 'version' | 'rate_pending'>[]> {
  if (rows.length === 0 || rows.length > IMPORT_CHUNK_MAX) {
    throw new RangeError(`insertTransactionsBatch: ${rows.length} rows is outside the allowed range (1..${IMPORT_CHUNK_MAX})`);
  }

  const payloads = rows.map((tx) => {
    assertAllowedKeys(tx as unknown as Record<string, unknown>, TRANSACTION_INSERT_KEYS, 'insertTransactionsBatch');
    const row: Record<string, unknown> = {};
    for (const key of TRANSACTION_INSERT_KEYS) {
      if (tx[key] !== undefined) row[key] = tx[key];
    }
    return row;
  });

  const { data, error, status } = await client
    .from('transactions')
    .upsert(payloads, { onConflict: 'id', ignoreDuplicates: true })
    .select('id, local_date, version, rate_pending');

  if (error) throw toDbError(error, status);
  return (data as Pick<TransactionRow, 'id' | 'local_date' | 'version' | 'rate_pending'>[] | null) ?? [];
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
    // RD-05: a 429 from resolve-rate's own per-user throttle is never a permanent failure
    // (the row simply stays rate_pending -- same as any other HTTP-layer error here), but
    // the client notes it so a burst of other pending writes does not keep calling an
    // endpoint that has already asked it to slow down (see resolveRateBackoff.ts).
    if (error instanceof FunctionsHttpError && (error.context as { status?: number } | undefined)?.status === 429) {
      noteResolveRateThrottled();
    }
    return null;
  }

  const row = (data as { row?: TransactionRow } | null)?.row;
  return row ?? null;
}
