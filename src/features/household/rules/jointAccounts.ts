// D-13: a joint account's full balance is visible to every member, including lines that are personal to one member. The
// server's joint_account_balances adds up paid lines per account and currency; the account's opening balance is added here
// (the account row is visible to members). Plain reads, no rules: the server decides who can see what.
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import type { DbClient } from '@/db/rows';
import { toDbError } from '@/db/errors';
import { supabase } from '@/services/supabase';

export interface JointBalanceRow {
  account_id: string;
  balance: number;
  currency: string;
}

export async function fetchJointAccountBalances(client: DbClient, householdId: string): Promise<JointBalanceRow[]> {
  const { data, error, status } = await client.rpc('joint_account_balances', { p_household_id: householdId });
  if (error) throw toDbError(error, status);
  return ((data as { account_id: string; balance: number | string; currency: string }[] | null) ?? []).map((r) => ({
    account_id: r.account_id,
    balance: Number(r.balance),
    currency: r.currency,
  }));
}

/** Lines other members have on an account (shared, live, not made by its creator): while any exist it must stay joint. */
export async function countMemberLinesOnAccount(accountId: string, creatorId: string, client: DbClient = supabase): Promise<number> {
  const { count, error, status } = await client
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('is_shared', true)
    .is('deleted_at', null)
    .neq('created_by', creatorId);
  if (error) throw toDbError(error, status);
  return count ?? 0;
}

/** The balances of the household's joint accounts. Under the transactions root so any line write refreshes it. */
export function useJointAccountBalances(householdId: string | null | undefined) {
  return useQuery({
    queryKey: [...queryKeys.transactionsRoot(householdId ?? ''), 'joint-balances'] as const,
    queryFn: () => fetchJointAccountBalances(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}

/** What one account shows: its opening balance plus its paid lines in the account's own currency. */
export function jointBalanceOf(openingBalance: number, currency: string, rows: readonly JointBalanceRow[], accountId: string): number {
  let sum = openingBalance;
  for (const r of rows) if (r.account_id === accountId && r.currency === currency) sum += r.balance;
  return sum;
}
