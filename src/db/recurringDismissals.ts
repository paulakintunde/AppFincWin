// 05.2 (DSU-05): "not a recurring" dismissals, one live row per household + payee_key + direction. Soft delete only,
// so Undo works. Key lists mirror the 05.2-03 grants exactly.

import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, type DbClient } from './rows';

export interface RecurringDismissalRow {
  id: string;
  household_id: string;
  payee_key: string;
  direction: 'in' | 'out';
  dismissed_at: string;
  created_by: string | null;
  deleted_at: string | null;
  version: number;
}

export type NewDismissal = Pick<RecurringDismissalRow, 'id' | 'household_id' | 'payee_key' | 'direction'>;
export type DismissalPatch = { deleted_at: string | null };

export const DISMISSAL_COLUMNS = 'id, household_id, payee_key, direction, dismissed_at, created_by, deleted_at, version';
export const DISMISSAL_INSERT_KEYS = ['id', 'household_id', 'payee_key', 'direction'] as const satisfies readonly (keyof NewDismissal)[];
export const DISMISSAL_PATCH_KEYS = ['deleted_at'] as const satisfies readonly (keyof DismissalPatch)[];

const ENTITY = 'recurring_dismissals' as const;
const UNIQUE_VIOLATION = '23505';

export async function fetchDismissals(client: DbClient, householdId: string): Promise<RecurringDismissalRow[]> {
  const { data, error, status } = await client
    .from('recurring_dismissals')
    .select(DISMISSAL_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('dismissed_at', { ascending: true });
  if (error) throw toDbError(error, status);
  return (data as RecurringDismissalRow[] | null) ?? [];
}

async function fetchDismissal(client: DbClient, id: string): Promise<RecurringDismissalRow | null> {
  const { data, error, status } = await client.from('recurring_dismissals').select(DISMISSAL_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as RecurringDismissalRow | null) ?? null;
}

async function fetchLiveDismissal(
  client: DbClient,
  householdId: string,
  payeeKey: string,
  direction: 'in' | 'out'
): Promise<RecurringDismissalRow | null> {
  const { data, error, status } = await client
    .from('recurring_dismissals')
    .select(DISMISSAL_COLUMNS)
    .eq('household_id', householdId)
    .eq('payee_key', payeeKey)
    .eq('direction', direction)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as RecurringDismissalRow | null) ?? null;
}

/**
 * A duplicate client id is read back as landed (MON-08, own: true). A collision on the live key (household +
 * payee_key + direction) means the answer is already in place, so the live row is returned with own: false and the
 * caller records no undo step for it (WR-03).
 */
export async function insertDismissal(
  client: DbClient,
  row: NewDismissal
): Promise<{ row: RecurringDismissalRow; own: boolean }> {
  assertAllowedKeys(row as unknown as Record<string, unknown>, DISMISSAL_INSERT_KEYS, 'insertDismissal');
  const { data, error, status } = await client.from('recurring_dismissals').insert(row).select(DISMISSAL_COLUMNS).single();
  if (!error) return { row: data as RecurringDismissalRow, own: true };
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchDismissal(client, row.id);
    if (existing) return { row: existing, own: true };
    const live = await fetchLiveDismissal(client, row.household_id, row.payee_key, row.direction);
    if (live) return { row: live, own: false };
  }
  throw toDbError(error, status);
}

export async function updateDismissal(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: DismissalPatch
): Promise<RecurringDismissalRow> {
  assertAllowedKeys(patch, DISMISSAL_PATCH_KEYS, 'updateDismissal');
  const { data, error, status } = await client
    .from('recurring_dismissals')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(DISMISSAL_COLUMNS);
  if (error) throw toDbError(error, status);
  const rows = (data as RecurringDismissalRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as RecurringDismissalRow;
  const serverRow = await fetchDismissal(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}
