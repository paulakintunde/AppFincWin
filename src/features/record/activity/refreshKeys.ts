// D-17 / M8: the one pull-to-refresh key list Home and Activity share, so neither can miss a key.
import type { QueryKey } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';

export function monthRefreshKeys(
  householdId: string | null | undefined,
  month: string,
): readonly QueryKey[] {
  if (householdId === null || householdId === undefined) return [];
  return [
    queryKeys.transactionsMonth(householdId, month),
    queryKeys.recurringSeries(householdId),
    queryKeys.fxLatest(),
    queryKeys.transactionMonths(householdId),
    queryKeys.accounts(householdId),
    queryKeys.accountBalances(householdId),
  ];
}
