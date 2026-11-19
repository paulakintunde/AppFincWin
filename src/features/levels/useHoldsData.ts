// 09-13 (D-34): "does this feature already hold the person's records?" -- read from query caches that already exist.
// While a probe's source has not loaded it answers true: data is never hidden during a load (T-09-50).
// 09-22: every probe now has a source. Seven come from caches other screens already fill (accounts, categories, goals, debts,
// split rules, settle-ups, linked refunds); four (transfers, imported lines, weight and amount splits) come from one light
// "does any such line exist" read (src/db/holdsData.ts).
import { useQuery } from '@tanstack/react-query';
import { useAccounts } from '@/data/queries/accounts';
import { useCategories } from '@/data/queries/categories';
import { useDebts, useStatementPeriods } from '@/data/queries/decide';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { useHoldingLotRows, useHoldingRows } from '@/data/queries/growHoldings';
import { useSplitDefaults, useSettlements } from '@/data/queries/householdBalances';
import { useHoldsFlags } from '@/data/queries/holdsFlags';
import { useHouseholdId } from '@/data/queries/household';
import { useMoneyPrefs } from '@/data/queries/moneyPrefs';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { queryKeys } from '@/data/keys';
import { fetchLinkedRefunds } from '@/db/transactions';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase';
import { deriveHolds, type HoldsDataProbeId } from './holdsDataModel';

export { deriveHolds, UNSOURCED } from './holdsDataModel';
export type { HoldsDataProbeId, HoldsSources } from './holdsDataModel';

export function useHoldsData(): Record<HoldsDataProbeId, boolean> {
  const { user } = useAuth();
  const userId = user?.id;
  const householdId = useHouseholdId(userId).data ?? undefined;
  const home = useMoneyPrefs(userId);
  const refunds = useQuery({
    queryKey: queryKeys.refundLinks(householdId ?? ''),
    queryFn: () => fetchLinkedRefunds(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
  return deriveHolds({
    accounts: useAccounts(householdId).data,
    homeCurrency: home.isSuccess ? home.prefs.home_currency : undefined,
    categories: useCategories(userId).data,
    series: useRecurringSeries(householdId).data,
    goals: useSavingsGoalRows(userId, householdId).data,
    debts: useDebts(householdId).data,
    holdings: useHoldingRows(userId, householdId).data,
    lots: useHoldingLotRows(userId, householdId).data,
    periods: useStatementPeriods(householdId).data,
    refunds: refunds.data,
    splitDefaults: useSplitDefaults(householdId).data,
    settlements: useSettlements(householdId).data,
    flags: useHoldsFlags(householdId).data,
  });
}
