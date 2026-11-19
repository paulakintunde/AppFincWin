// 09-13 (D-34): "does this feature already hold the person's records?" -- read from query caches that already exist (no new fetch).
// While a probe's source has not loaded it answers true: data is never hidden during a load (T-09-50).
// Probes with no cached source yet answer false (listed in UNSOURCED); a later plan wires each to its own read.
import { useAccounts } from '@/data/queries/accounts';
import { useDebts, useStatementPeriods } from '@/data/queries/decide';
import { useSavingsGoalRows } from '@/data/queries/growGoals';
import { useHoldingLotRows, useHoldingRows } from '@/data/queries/growHoldings';
import { useHouseholdId } from '@/data/queries/household';
import { useMoneyPrefs } from '@/data/queries/moneyPrefs';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useAuth } from '@/features/auth/AuthProvider';
import { FEATURES } from './featureRegistry';

export type HoldsDataProbeId = NonNullable<(typeof FEATURES)[number]['holdsData']>;

/** Probes with no existing cached read to ask. They answer false until a later plan wires a source. */
export const UNSOURCED: readonly HoldsDataProbeId[] = [
  'refundLinks',
  'transfers',
  'categoryCaps',
  'goalContributions',
  'debtPlan',
  'importedLines',
  'weightSplits',
  'amountSplits',
  'categoryDefaultSplits',
  'sharedAccounts',
  'settlements',
];

export function useHoldsData(): Record<HoldsDataProbeId, boolean> {
  const { user } = useAuth();
  const userId = user?.id;
  const householdId = useHouseholdId(userId).data ?? undefined;
  const accounts = useAccounts(householdId).data;
  const series = useRecurringSeries(householdId).data;
  const goals = useSavingsGoalRows(userId, householdId).data;
  const debts = useDebts(householdId).data;
  const holdings = useHoldingRows(userId, householdId).data;
  const lots = useHoldingLotRows(userId, householdId).data;
  const periods = useStatementPeriods(householdId).data;
  const home = useMoneyPrefs(userId);

  const liveAccounts = accounts?.filter((a) => a.deleted_at === null && a.archived_at === null);
  const out = {} as Record<HoldsDataProbeId, boolean>;
  for (const f of FEATURES) if (f.holdsData !== null) out[f.holdsData] = false;

  out.recurringSeries = series === undefined ? true : series.length > 0;
  out.multipleAccounts = liveAccounts === undefined ? true : liveAccounts.length > 1;
  out.foreignCurrency =
    liveAccounts === undefined || !home.isSuccess
      ? true
      : liveAccounts.some((a) => a.currency !== home.prefs.home_currency);
  out.savingsGoals =
    goals === undefined ? true : goals.some((g) => g.deleted_at === null && g.is_safety_net !== true);
  out.debts = debts === undefined ? true : debts.length > 0;
  out.holdings = holdings === undefined ? true : holdings.length > 0;
  out.holdingLots = lots === undefined ? true : lots.some((l) => l.deleted_at === null);
  out.statementPeriods = periods === undefined ? true : periods.length > 0;
  return out;
}
