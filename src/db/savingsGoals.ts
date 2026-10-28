// 05-38 (D-34): savings goal. Saved-so-far is computed from tagged lines (05-39), never stored.
// 05-122 (D-101): the same table now holds pots (kind 'pot', client-inserted) and Wait goals (kind 'wait', inserted
// only by record_decide_outcome). Key lists mirror the 05-119 grants exactly: kind is written on insert and never
// patched; a Wait goal's columns other than done_at and deleted_at are frozen by the guard.

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
  kind: 'wait' | 'pot';
  bucket?: 'college' | 'house' | 'car' | 'trip' | 'business' | 'wedding' | 'other' | null;
  account_id?: string | null;
  color_key?: 'green' | 'slate' | 'teal' | 'blue' | 'plum' | 'rust' | 'ochre' | null;
  done_at: string | null;
  is_sample: boolean;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export const SAVINGS_GOAL_COLUMNS =
  'id, household_id, created_by, check_id, name, currency, target, monthly_amount, ready_by, opening_saved, kind, bucket, account_id, color_key, done_at, is_sample, deleted_at, version, created_at, updated_at';

/**
 * A pot as a client inserts it: home currency, a target and a month end are required by the shape check.
 * 05.2 D-22: a saving bucket (bucket set) may leave target and ready_by null and carries a monthly amount.
 */
interface NewPotBase {
  id: string;
  household_id: string;
  kind: 'pot';
  name: string;
  currency: string;
  opening_saved: number;
  account_id?: string | null;
  color_key?: SavingsGoalRow['color_key'];
}
export type NewPot =
  | (NewPotBase & { target: number; ready_by: string; bucket?: null; monthly_amount?: null })
  | (NewPotBase & {
      bucket: NonNullable<SavingsGoalRow['bucket']>;
      target: number | null;
      ready_by: null;
      monthly_amount?: number | null;
    });

/** target and ready_by are never null in a patch: a pot's shape check needs both (a Wait goal's are frozen anyway). */
export type SavingsGoalPatch = Partial<
  Pick<SavingsGoalRow, 'name' | 'opening_saved' | 'done_at' | 'deleted_at' | 'account_id' | 'monthly_amount' | 'color_key'> & { target: number; ready_by: string }
>;

export const SAVINGS_GOAL_INSERT_KEYS = [
  'id',
  'household_id',
  'kind',
  'name',
  'currency',
  'target',
  'ready_by',
  'opening_saved',
  'bucket',
  'account_id',
  'monthly_amount',
  'color_key',
] as const satisfies readonly (keyof NewPotBase | 'target' | 'ready_by' | 'bucket' | 'monthly_amount')[];

export const SAVINGS_GOAL_PATCH_KEYS = [
  'name',
  'target',
  'ready_by',
  'opening_saved',
  'done_at',
  'deleted_at',
  'account_id',
  'monthly_amount',
  'color_key',
] as const satisfies readonly (keyof SavingsGoalPatch)[];

const ENTITY = 'savings_goals' as const;
const UNIQUE_VIOLATION = '23505';
const NAME_MAX = 80;
const TARGET_MAX = 10 ** 13;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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

function validatePot(p: {
  name?: string;
  target?: number | null;
  ready_by?: string | null;
  opening_saved?: number;
  monthly_amount?: number | null;
}): void {
  if (p.name !== undefined && (p.name.trim().length < 1 || p.name.length > NAME_MAX)) {
    throw new RangeError('pot: name must be 1 to 80 characters');
  }
  if (p.target !== undefined && p.target !== null && (!Number.isInteger(p.target) || p.target < 1 || p.target > TARGET_MAX)) {
    throw new RangeError('pot: target must be an integer from 1 to 10^13');
  }
  if (p.opening_saved !== undefined && (!Number.isInteger(p.opening_saved) || p.opening_saved < 0 || p.opening_saved > TARGET_MAX)) {
    throw new RangeError('pot: opening_saved must be a non-negative integer');
  }
  if (p.ready_by !== undefined && p.ready_by !== null && !DATE_RE.test(p.ready_by)) {
    throw new RangeError('pot: ready_by must be a date');
  }
  if (
    p.monthly_amount !== undefined &&
    p.monthly_amount !== null &&
    (!Number.isInteger(p.monthly_amount) || p.monthly_amount < 0 || p.monthly_amount > TARGET_MAX)
  ) {
    throw new RangeError('pot: monthly_amount must be a non-negative integer');
  }
}

/** D-101: a client-inserted row is always a pot (the guard forces kind). A duplicate client id is read back as landed (MON-08). */
export async function insertSavingsGoal(client: DbClient, pot: NewPot): Promise<SavingsGoalRow> {
  assertAllowedKeys(pot as unknown as Record<string, unknown>, SAVINGS_GOAL_INSERT_KEYS, 'insertSavingsGoal');
  if (pot.kind !== 'pot') throw new RangeError('insertSavingsGoal: only pots are inserted from the client');
  validatePot(pot);
  // Mirrors savings_goals_pot_shape: an ordinary pot needs both a target and a month end and no monthly amount.
  if (pot.bucket == null && (pot.target === null || pot.ready_by === null || pot.monthly_amount != null)) {
    throw new RangeError('insertSavingsGoal: a pot needs a target and a ready-by date');
  }

  const { data, error, status } = await client.from('savings_goals').insert(pot as unknown as Record<string, unknown>).select(SAVINGS_GOAL_COLUMNS).single();
  if (!error) return data as SavingsGoalRow;

  if (error.code === UNIQUE_VIOLATION) {
    const existing = await fetchSavingsGoal(client, pot.id);
    if (existing) return existing;
  }
  throw toDbError(error, status);
}

/** The granted columns only (05.2): kind, check_id, currency and bucket are never patched; monthly_amount only lands on a bucket. */
export async function updateSavingsGoal(
  client: DbClient,
  id: string,
  expectedVersion: number,
  patch: SavingsGoalPatch
): Promise<SavingsGoalRow> {
  assertAllowedKeys(patch, SAVINGS_GOAL_PATCH_KEYS, 'updateSavingsGoal');
  validatePot(patch);

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
