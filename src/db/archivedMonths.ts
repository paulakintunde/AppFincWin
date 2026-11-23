// 10-03 (DAT-01): months the person has archived (hidden from the main views, never deleted). Own rows only (RLS).
import { toDbError } from './errors';
import type { DbClient } from './rows';

export const ARCHIVED_MONTHS_COLUMNS = 'month, archived_at';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertMonth(month: string): void {
  if (!MONTH_RE.test(month)) throw new TypeError(`archived_months: bad month ${month}`);
}

/** Archived months as 'YYYY-MM', newest first. */
export async function fetchArchivedMonths(client: DbClient, userId: string): Promise<string[]> {
  const { data, error, status } = await client.from('archived_months').select(ARCHIVED_MONTHS_COLUMNS).eq('user_id', userId);
  if (error) throw toDbError(error, status);
  return ((data ?? []) as { month: string }[]).map((r) => r.month).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export async function insertArchivedMonth(client: DbClient, userId: string, month: string): Promise<void> {
  assertMonth(month);
  const { error, status } = await client
    .from('archived_months')
    .upsert({ user_id: userId, month }, { onConflict: 'user_id,month', ignoreDuplicates: true });
  if (error) throw toDbError(error, status);
}

export async function deleteArchivedMonth(client: DbClient, userId: string, month: string): Promise<void> {
  assertMonth(month);
  const { error, status } = await client.from('archived_months').delete().eq('user_id', userId).eq('month', month);
  if (error) throw toDbError(error, status);
}

export async function deleteAllArchivedMonths(client: DbClient, userId: string): Promise<void> {
  const { error, status } = await client.from('archived_months').delete().eq('user_id', userId);
  if (error) throw toDbError(error, status);
}
