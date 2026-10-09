// Record's read-only RPCs and per-user lookups (REC-08, ACT-02, D-26): per-account paid and
// pending sums beyond the cached month, the list of months that have data, and household
// member display names (used by Accounts, Activity and undo-refusal copy).
//
// Sums stay strings (bigint-safe, mirroring TRANSACTION_COLUMNS's rate casts in
// transactions.ts) -- they are parsed only by engine/activity's accountBalance, using
// BigInt, never a JS-float-based numeric conversion, here or in any caller of this module.

import { DbError, toDbError } from './errors';
import { BAD_RESPONSE, type SeriesUndoLabel } from './recurringSeries';
import type { DbClient } from './rows';

/** One (account, currency) leg's paid/pending totals -- `account_balances` (plan 02-09). Sums include transfer legs (D-50). */
export interface AccountBalanceLegRow {
  account_id: string;
  currency: string;
  paid_sum: string;
  pending_sum: string;
}

/** One month with at least one active row -- `transaction_months` (plan 02-09), newest first. */
export interface TransactionMonthRow {
  month: string;
  row_count: number;
}

export interface HouseholdMemberNameRow {
  user_id: string;
  display_name: string | null;
}

export async function fetchAccountBalances(client: DbClient, householdId: string): Promise<AccountBalanceLegRow[]> {
  const { data, error, status } = await client.rpc('account_balances', { p_household_id: householdId });

  if (error) throw toDbError(error, status);
  return (data as AccountBalanceLegRow[] | null) ?? [];
}

export async function fetchTransactionMonths(client: DbClient, householdId: string): Promise<TransactionMonthRow[]> {
  const { data, error, status } = await client.rpc('transaction_months', { p_household_id: householdId });

  if (error) throw toDbError(error, status);
  return (data as TransactionMonthRow[] | null) ?? [];
}

export async function fetchHouseholdMemberNames(client: DbClient, householdId: string): Promise<HouseholdMemberNameRow[]> {
  const { data, error, status } = await client
    .from('household_members')
    .select('user_id, display_name')
    .eq('household_id', householdId);

  if (error) throw toDbError(error, status);
  return (data as HouseholdMemberNameRow[] | null) ?? [];
}

/** One (account, currency) leg's pending inflow/outflow split -- `account_pending_split`. Sums stay strings. */
export interface AccountPendingSplitRow {
  accountId: string;
  currency: string;
  pendingIn: string;
  pendingOut: string;
  pendingCount: number;
}

/** One (account, currency) leg's paid total before a date -- `account_paid_before`. Sums stay strings. */
export interface AccountPaidBeforeRow {
  accountId: string;
  currency: string;
  paidSum: string;
  paidHomeSum: string;
  unconverted: number;
}

function badResponse(context: string): DbError {
  return new DbError(`record read RPC response: ${context}`, BAD_RESPONSE, null);
}

function asRows(data: unknown, context: string): Record<string, unknown>[] {
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw badResponse(`${context} is not an array`);
  return data.map((row) => {
    if (typeof row !== 'object' || row === null) throw badResponse(`${context} row is not an object`);
    return row as Record<string, unknown>;
  });
}

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (typeof v !== 'string') throw badResponse(`${key} is not a string`);
  return v;
}

function int(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw badResponse(`${key} is not an integer`);
  return v;
}

export async function fetchAccountPendingSplit(client: DbClient, householdId: string): Promise<AccountPendingSplitRow[]> {
  const { data, error, status } = await client.rpc('account_pending_split', { p_household_id: householdId });

  if (error) throw toDbError(error, status);
  return asRows(data, 'account_pending_split').map((row) => ({
    accountId: str(row, 'account_id'),
    currency: str(row, 'currency'),
    pendingIn: str(row, 'pending_in'),
    pendingOut: str(row, 'pending_out'),
    pendingCount: int(row, 'pending_count'),
  }));
}

export async function fetchAccountPaidBefore(
  client: DbClient,
  householdId: string,
  before: string
): Promise<AccountPaidBeforeRow[]> {
  const { data, error, status } = await client.rpc('account_paid_before', {
    p_household_id: householdId,
    p_before: before,
  });

  if (error) throw toDbError(error, status);
  return asRows(data, 'account_paid_before').map((row) => ({
    accountId: str(row, 'account_id'),
    currency: str(row, 'currency'),
    paidSum: str(row, 'paid_sum'),
    paidHomeSum: str(row, 'paid_home_sum'),
    unconverted: int(row, 'unconverted'),
  }));
}

/** add_activity_month rejected the month (22023): invalid month text or past the cap. */
export class MonthNotAddableError extends Error {
  readonly code = 'month-not-addable';

  constructor(readonly month: string) {
    super(`Month ${month} cannot be added`);
    this.name = 'MonthNotAddableError';
  }
}

export type AddActivityMonthResult =
  | { status: 'applied'; month: string; insertedIds: string[]; undoStepId: string | null }
  | { status: 'already-applied' };

export async function addActivityMonth(
  client: DbClient,
  args: { householdId: string; month: string; today: string; undo: SeriesUndoLabel }
): Promise<AddActivityMonthResult> {
  const { data, error, status } = await client.rpc('add_activity_month', {
    p_household_id: args.householdId,
    p_month: args.month,
    p_today: args.today,
    p_undo_step: { id: args.undo.id, label_key: args.undo.labelKey, label_params: args.undo.labelParams },
  });

  if (error) {
    if (error.code === '22023') throw new MonthNotAddableError(args.month);
    throw toDbError(error, status);
  }

  const env = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
  if (env?.status === 'already-applied') return { status: 'already-applied' };
  if (env?.status !== 'applied') throw badResponse('add_activity_month unrecognised status');
  const inserted = env.inserted;
  if (typeof env.month !== 'string' || !Array.isArray(inserted) || inserted.some((id) => typeof id !== 'string')) {
    throw badResponse('add_activity_month malformed applied envelope');
  }
  const undoStepId = env.undo_step_id;
  if (undoStepId !== undefined && undoStepId !== null && typeof undoStepId !== 'string') {
    throw badResponse('add_activity_month malformed undo_step_id');
  }
  return {
    status: 'applied',
    month: env.month,
    insertedIds: inserted as string[],
    undoStepId: (undoStepId as string | null | undefined) ?? null,
  };
}
