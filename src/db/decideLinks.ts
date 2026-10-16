// 05-05: typed reads and writes for decide_links (05-03). A link ties a check to a transaction,
// a repeating series or a debt. `source` is never client-written (the guard trigger forces
// 'attached' outside record_decide_go); `role` is client-insertable for attached lines (D-36).

import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, type DbClient, type TransactionRow } from './rows';
import { TRANSACTION_COLUMNS } from './transactions';

export type DecideLinkRoleValue = 'day_one' | 'payment' | 'running_cost';

export interface DecideLinkRow {
  id: string;
  household_id: string;
  created_by: string;
  check_id: string;
  entity: 'transactions' | 'recurring_series' | 'debts';
  target_id: string;
  source: 'written' | 'attached';
  role: DecideLinkRoleValue | null;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export const DECIDE_LINK_COLUMNS =
  'id, household_id, created_by, check_id, entity, target_id, source, role, deleted_at, version, created_at, updated_at';

export type NewDecideLink = Pick<DecideLinkRow, 'id' | 'household_id' | 'check_id' | 'entity' | 'target_id'> & {
  role?: DecideLinkRoleValue | null;
};

export const DECIDE_LINK_INSERT_KEYS = [
  'id',
  'household_id',
  'check_id',
  'entity',
  'target_id',
  'role',
] as const satisfies readonly (keyof NewDecideLink)[];

export const DECIDE_LINK_PATCH_KEYS = ['deleted_at'] as const;

const ENTITY = 'decide_links' as const;
const UNIQUE_VIOLATION = '23505';
const MAX_FILTER_IDS = 200;
const UUID = /^[0-9a-f-]{36}$/i;

export async function fetchDecideLinks(client: DbClient, checkIds: readonly string[]): Promise<DecideLinkRow[]> {
  if (checkIds.length === 0) return [];

  const { data, error, status } = await client
    .from('decide_links')
    .select(DECIDE_LINK_COLUMNS)
    .in('check_id', checkIds as string[])
    .is('deleted_at', null);

  if (error) throw toDbError(error, status);
  return (data as DecideLinkRow[] | null) ?? [];
}

async function fetchDecideLink(client: DbClient, id: string): Promise<DecideLinkRow | null> {
  const { data, error, status } = await client.from('decide_links').select(DECIDE_LINK_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as DecideLinkRow | null) ?? null;
}

export async function insertDecideLink(client: DbClient, row: NewDecideLink): Promise<DecideLinkRow> {
  assertAllowedKeys(row as unknown as Record<string, unknown>, DECIDE_LINK_INSERT_KEYS, 'insertDecideLink');

  const { data, error, status } = await client.from('decide_links').insert(row).select(DECIDE_LINK_COLUMNS).single();
  if (!error) return data as DecideLinkRow;

  // MON-08: a duplicate client id means this exact write already landed (replay).
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchDecideLink(client, row.id);
    if (existing) return existing;
  }
  throw toDbError(error, status);
}

export async function updateDecideLink(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: { deleted_at: string | null }
): Promise<DecideLinkRow> {
  assertAllowedKeys(patch, DECIDE_LINK_PATCH_KEYS, 'updateDecideLink');

  const { data, error, status } = await client
    .from('decide_links')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(DECIDE_LINK_COLUMNS);

  if (error) throw toDbError(error, status);
  const rows = (data as DecideLinkRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as DecideLinkRow;

  const serverRow = await fetchDecideLink(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}

function checkedIds(ids: readonly string[], label: string): string[] {
  if (ids.length > MAX_FILTER_IDS) {
    throw new RangeError(`fetchLinkedLines: at most ${MAX_FILTER_IDS} ${label}, got ${ids.length}`);
  }
  for (const id of ids) {
    if (!UUID.test(id)) throw new TypeError(`fetchLinkedLines: "${id}" is not a uuid`);
  }
  return [...ids];
}

/**
 * Live transactions whose id is in transactionIds OR whose recurring_series_id is in seriesIds.
 * Only regex-validated uuids are interpolated into the PostgREST filter (T-05-05-02).
 */
export async function fetchLinkedLines(
  client: DbClient,
  householdId: string,
  ids: { transactionIds: readonly string[]; seriesIds: readonly string[] }
): Promise<TransactionRow[]> {
  const txIds = checkedIds(ids.transactionIds, 'transaction ids');
  const seriesIds = checkedIds(ids.seriesIds, 'series ids');
  if (txIds.length === 0 && seriesIds.length === 0) return [];
  if (!UUID.test(householdId)) throw new TypeError(`fetchLinkedLines: "${householdId}" is not a uuid`);

  const clauses: string[] = [];
  if (txIds.length > 0) clauses.push(`id.in.(${txIds.join(',')})`);
  if (seriesIds.length > 0) clauses.push(`recurring_series_id.in.(${seriesIds.join(',')})`);

  const { data, error, status } = await client
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .or(clauses.join(','));

  if (error) throw toDbError(error, status);
  return (data as unknown as TransactionRow[] | null) ?? [];
}

type LinkTarget = Pick<DecideLinkRow, 'check_id' | 'target_id'>;

/**
 * D-48: live written payment links (series paying a Go-ahead purchase), for the snapshot's
 * covered-series rule. RLS keeps them the caller's own.
 */
export async function fetchPaymentLinks(client: DbClient): Promise<LinkTarget[]> {
  const { data, error, status } = await client
    .from('decide_links')
    .select('check_id, target_id')
    .eq('entity', 'recurring_series')
    .eq('source', 'written')
    .eq('role', 'payment')
    .is('deleted_at', null);

  if (error) throw toDbError(error, status);
  return (data as LinkTarget[] | null) ?? [];
}

/**
 * D-40: live written transaction links, so the snapshot can leave a Go-ahead card purchase
 * paid by its payoff series out of the card's minimum.
 */
export async function fetchWrittenRowLinks(client: DbClient): Promise<LinkTarget[]> {
  const { data, error, status } = await client
    .from('decide_links')
    .select('check_id, target_id')
    .eq('entity', 'transactions')
    .eq('source', 'written')
    .is('deleted_at', null);

  if (error) throw toDbError(error, status);
  return (data as LinkTarget[] | null) ?? [];
}
