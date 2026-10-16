// 05-38 (D-34): minimal savings goal. Read and soft-delete only; record_decide_outcome (05-04)
// inserts. Saved-so-far is computed from tagged lines (05-39), never stored.

import { NotFoundError, VersionConflictError, toDbError } from './errors';
import { assertAllowedKeys, type DbClient, type TransactionRow } from './rows';
import { TRANSACTION_COLUMNS } from './transactions';

export interface SavingsGoalRow {
  id: string;
  household_id: string;
  created_by: string;
  check_id: string | null;
  name: string;
  currency: string;
  target: number | null;
  monthly_amount: number | null;
  ready_by: string | null;
  opening_saved: number;
  is_sample: boolean;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export const SAVINGS_GOAL_COLUMNS =
  'id, household_id, created_by, check_id, name, currency, target, monthly_amount, ready_by, opening_saved, is_sample, deleted_at, version, created_at, updated_at';

const SAVINGS_GOAL_PATCH_KEYS = ['deleted_at'] as const;
const ENTITY = 'savings_goals' as const;
const UUID_RE = /^[0-9a-f-]{36}$/i;
export const GOAL_LINES_MAX = 200;

export async function fetchSavingsGoals(client: DbClient, householdId: string): Promise<SavingsGoalRow[]> {
  const { data, error, status } = await client
    .from('savings_goals')
    .select(SAVINGS_GOAL_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as SavingsGoalRow[] | null) ?? [];
}

async function fetchSavingsGoal(client: DbClient, id: string): Promise<SavingsGoalRow | null> {
  const { data, error, status } = await client.from('savings_goals').select(SAVINGS_GOAL_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw toDbError(error, status);
  return (data as SavingsGoalRow | null) ?? null;
}

/** Only deleted_at is granted server-side (05-32). */
export async function updateSavingsGoal(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: { deleted_at: string | null }
): Promise<SavingsGoalRow> {
  assertAllowedKeys(patch, SAVINGS_GOAL_PATCH_KEYS, 'updateSavingsGoal');

  const { data, error, status } = await client
    .from('savings_goals')
    .update(patch)
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(SAVINGS_GOAL_COLUMNS);

  if (error) throw toDbError(error, status);

  const rows = (data as SavingsGoalRow[] | null) ?? [];
  if (rows.length === 1) return rows[0] as SavingsGoalRow;

  const serverRow = await fetchSavingsGoal(client, id);
  if (serverRow) throw new VersionConflictError(ENTITY, id, serverRow);
  throw new NotFoundError(ENTITY, id);
}

/** D-34: live transactions tagged to the given goals (goal_id, 05-32). Validated uuids only. */
export async function fetchGoalLines(
  client: DbClient,
  householdId: string,
  goalIds: readonly string[]
): Promise<TransactionRow[]> {
  if (goalIds.length === 0) return [];
  if (goalIds.length > GOAL_LINES_MAX) {
    throw new RangeError(`fetchGoalLines: ${goalIds.length} ids exceeds GOAL_LINES_MAX (${GOAL_LINES_MAX})`);
  }
  for (const id of goalIds) {
    if (!UUID_RE.test(id)) throw new RangeError('fetchGoalLines: invalid goal id');
  }

  const { data, error, status } = await client
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('household_id', householdId)
    .is('deleted_at', null)
    .in('goal_id', goalIds);

  if (error) throw toDbError(error, status);
  return (data as TransactionRow[] | null) ?? [];
}
