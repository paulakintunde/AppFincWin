// 05.3-27 (DSV-13, T-05.3-27-03): where and under what names Record as bought writes. The money goes to an everyday account
// only; with none, the context is null and the sheet shows why the confirm is off. The loan's rate is not carried by the
// Purchase, so the caller may pass it as aprText.
import { useMemo } from 'react';
import { useAccounts } from '@/data/queries/accounts';
import { useCategoryLookup } from '@/data/queries/categories';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { AccountRow } from '@/db/rows';
import type { Purchase } from '@/engine/decide/v3';
import { useRecordContext } from '@/features/record/useRecordContext';
import type { BoughtContext } from './recordMutations';

type PickableAccount = Pick<AccountRow, 'id' | 'kind' | 'currency' | 'archived_at' | 'deleted_at' | 'use'>;

/** The first live account that is used every day; else the first live cash or checking account (Record's own default); else none. */
export function pickCashAccount<A extends PickableAccount>(accounts: readonly A[] | undefined): A | null {
  const live = (accounts ?? []).filter((a) => a.archived_at === null && a.deleted_at === null);
  return (
    live.find((a) => a.use === 'everyday') ?? live.find((a) => a.kind === 'cash' || a.kind === 'checking') ?? null
  );
}

export function useBoughtContext(
  row: DecideCheckRow | null,
  purchase: Purchase | null,
  aprText?: string | null
): BoughtContext | null {
  const rc = useRecordContext();
  const accounts = useAccounts(rc.householdId ?? undefined).data;
  const lookup = useCategoryLookup(rc.userId ?? undefined);
  const debtCategoryId = lookup.builtinIds.get('Debt') ?? null;
  const cash = useMemo(() => pickCashAccount(accounts), [accounts]);
  const householdId = rc.householdId;
  const { timeZone, today } = rc;
  const name = row?.name.trim() ?? '';
  const runningCostCategoryId = purchase?.categoryId ?? null;

  return useMemo<BoughtContext | null>(() => {
    if (row === null || householdId === null || cash === null) return null;
    return {
      householdId,
      currency: cash.currency,
      timeZone,
      today,
      cashAccountId: cash.id,
      debtCategoryId,
      runningCostCategoryId,
      name,
      aprText: aprText ?? null,
    };
  }, [row, householdId, cash, timeZone, today, debtCategoryId, runningCostCategoryId, name, aprText]);
}
