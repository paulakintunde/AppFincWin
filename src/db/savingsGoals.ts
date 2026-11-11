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
  // 06 Grow (20261106000100): optional so rows cached before the update still type-check; absent reads safely (locked, not a safety net).
  is_safety_net?: boolean;
  locked?: boolean;
  protect?: boolean;
  up_front_only?: boolean;
  icon?: 'calendar' | 'laptop' | 'phone' | 'camera' | 'savings' | 'housing' | 'transport' | 'headphones' | null;
  net_confirmed_at?: string | null;
  // 06.1 (20261111000100) D-20: Decide-only 'answers may use it' flag on the safety net. Read-only: only set_net_answer_use writes it.
  decide_may_use?: boolean;
  done_at: string | null;
  is_sample: boolean;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export const SAVINGS_GOAL_COLUMNS =
  'id, household_id, created_by, check_id, name, currency, target, monthly_amount, ready_by, opening_saved, kind, bucket, account_id, color_key, is_safety_net, locked, protect, up_front_only, icon, net_confirmed_at, done_at, is_sample, deleted_at, version, created_at, updated_at';

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

/**
 * 06 Grow: a goal as the Grow flow inserts it. Open-ended goals leave target, ready_by and monthly_amount null.
 * `locked` is REQUIRED (D-23): the user answers "keep this money out of Decide's answers?" with no default.
 */
export interface NewGoal {
  id: string;
  household_id: string;
  kind: 'pot';
  name: string;
  currency: string;
  opening_saved: number;
  locked: boolean;
  target: number | null;
  ready_by: string | null;
  monthly_amount: number | null;
  account_id?: string | null;
  color_key?: SavingsGoalRow['color_key'];
  icon?: SavingsGoalRow['icon'];
  is_safety_net?: boolean;
  protect?: boolean;
  up_front_only?: boolean;
  check_id?: string | null;
}

/** ready_by is never null in a patch. target may be null only for a saving bucket (05.2 D-22: a bucket's goal is optional); the mutation refuses it for an ordinary pot and the pot shape check enforces it in the database. */
export type SavingsGoalPatch = Partial<
  Pick<SavingsGoalRow, 'name' | 'opening_saved' | 'done_at' | 'deleted_at' | 'account_id' | 'monthly_amount' | 'color_key' | 'locked' | 'protect' | 'up_front_only' | 'icon' | 'net_confirmed_at'> & { target: number | null; ready_by: string }
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
  'is_safety_net',
  'locked',
  'protect',
  'up_front_only',
  'icon',
  'check_id',
] as const satisfies readonly (keyof NewPotBase | keyof NewGoal | 'target' | 'ready_by' | 'bucket' | 'monthly_amount')[];

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
  'locked',
  'protect',
  'up_front_only',
  'icon',
  'net_confirmed_at',
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
export async function insertSavingsGoal(client: DbClient, pot: NewPot | NewGoal): Promise<SavingsGoalRow> {
  assertAllowedKeys(pot as unknown as Record<string, unknown>, SAVINGS_GOAL_INSERT_KEYS, 'insertSavingsGoal');
  if (pot.kind !== 'pot') throw new RangeError('insertSavingsGoal: only pots are inserted from the client');
  validatePot(pot);
  // Mirrors the pre-06 savings_goals_pot_shape for a legacy pot: it needs both a target and a month end and no monthly amount.
  // A Grow goal (it carries `locked`) may be open-ended (06 relaxed the constraint), so the legacy rule does not apply.
  if (!('locked' in pot) && pot.bucket == null && (pot.target === null || pot.ready_by === null || pot.monthly_amount != null)) {
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
