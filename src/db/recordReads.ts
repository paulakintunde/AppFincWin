// Record's read-only RPCs and per-user lookups (REC-08, ACT-02, D-26): per-account paid and
// pending sums beyond the cached month, the list of months that have data, and household
// member display names (used by Accounts, Activity and undo-refusal copy).
//
// Sums stay strings (bigint-safe, mirroring TRANSACTION_COLUMNS's rate casts in
// transactions.ts) -- they are parsed only by engine/activity's accountBalance, using
// BigInt, never a JS-float-based numeric conversion, here or in any caller of this module.

import { toDbError } from './errors';
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
