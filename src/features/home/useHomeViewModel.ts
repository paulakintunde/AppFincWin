// HOME-01..04 / D-32: gathers Home's inputs from the same Phase 2 hooks and query keys Activity
// uses, so Home mounts no extra server call. All maths is the engine's (monthPosition). Do not
// mount useActivityViewModel here: it also loads view prefs, search, running balance and offers.
import { useCallback, useMemo } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { useAccounts } from '@/data/queries/accounts';
import {
  useAccountBalances,
  useMonthView,
  useTransactionMonths,
  type AccountBalanceView,
} from '@/data/queries/activity';
import type { MonthDataState } from '@/data/queries/monthDataState';
import { monthRefreshKeys } from '@/features/record/activity/refreshKeys';
import type { AccountRow } from '@/db/rows';
import { type MonthPosition, type MonthTotals } from '@/engine/activity';
import { monthPositionOf } from '@/features/record/activity/monthFigureInputs';
import { monthOf } from '@/engine/time';
import { useRecordContext, type RecordContext } from '@/features/record/useRecordContext';
import { useRowFlow } from '@/features/record/activity/useActivityViewModel';
import { useRowActions, type RowActions } from '@/features/record/activity/useRowActions';
import { useSelectedMonth } from '@/state/activityFocus';
import { useMoneyFormatter, type MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { selectComingUp, type ComingUpItem } from './comingUp';

export function useHomeViewModel(): {
  rc: RecordContext;
  formatter: MoneyFormatter;
  month: string;
  setMonth(m: string): void;
  months: string[];
  totals: MonthTotals;
  position: MonthPosition;
  loading: boolean;
  dataState: MonthDataState;
  isError: boolean;
  comingUp: ComingUpItem[];
  comingUpTotal: number;
  accounts: AccountRow[];
  balances: Map<string, AccountBalanceView>;
  accountsLoading: boolean;
  rowActions: RowActions;
  flow: ReturnType<typeof useRowFlow>;
  refreshKeys: readonly QueryKey[];
} {
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const [month, setMonth] = useSelectedMonth(monthOf(rc.today));

  const monthView = useMonthView(
    { householdId: rc.householdId, homeCurrency: rc.homeCurrency, today: rc.today },
    month
  );
  const { months } = useTransactionMonths(rc.householdId, rc.today, rc.horizonMonth ?? null);
  const accountsQuery = useAccounts(rc.householdId ?? undefined);
  const accountsData = accountsQuery.data;
  const allAccounts = useMemo(() => accountsData ?? [], [accountsData]);
  const accounts = useMemo(
    () => allAccounts.filter((a) => a.archived_at === null && a.deleted_at === null),
    [allAccounts]
  );
  const { balances, isLoading: balancesLoading } = useAccountBalances(rc.householdId, allAccounts);

  const position = useMemo(
    () =>
      monthPositionOf({
        rows: monthView.rows,
        projections: monthView.projections,
        totals: monthView.totals,
      }),
    [monthView.rows, monthView.projections, monthView.totals]
  );

  const coming = useMemo(
    () => selectComingUp(monthView.rows, monthView.projections),
    [monthView.rows, monthView.projections]
  );

  const accountName = useCallback(
    (id: string): string => allAccounts.find((a) => a.id === id)?.name ?? '',
    [allAccounts]
  );
  const rowActions = useRowActions({
    householdId: rc.householdId,
    ownerId: rc.userId,
    today: rc.today,
    selectionActive: false,
    rows: monthView.rows,
    accountName,
  });
  const flow = useRowFlow(rowActions, month);

  const hh = rc.householdId;
  const refreshKeys = useMemo(() => monthRefreshKeys(hh, month), [hh, month]);
  const dataState: MonthDataState = rc.ready ? monthView.dataState : 'loading';

  return {
    rc,
    formatter,
    month,
    setMonth,
    months,
    totals: monthView.totals,
    position,
    loading: dataState === 'loading',
    dataState,
    isError: monthView.isError,
    comingUp: coming.items,
    comingUpTotal: coming.total,
    accounts,
    balances,
    accountsLoading: accountsQuery.isLoading || balancesLoading,
    rowActions,
    flow,
    refreshKeys,
  };
}
