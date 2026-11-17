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
import { monthPicture } from '@/engine/month';
import type { MinorUnits } from '@/engine/money';
import { useDecideV3 } from '@/data/queries/decideV3';
import {
  figureTotalsOf,
  householdLeftAfterPlans,
  householdMonthRows,
  mineMonthRows,
  rowsNeedSplits,
  type FigureScope,
  type SplitsByLine,
} from '@/data/queries/figureScope';
import { useHousehold, useHouseholdMembers } from '@/data/queries/household';
import { useSharedSplits } from '@/data/queries/householdBalances';
import { useRecordContext, type RecordContext } from '@/features/record/useRecordContext';
import { useRowFlow } from '@/features/record/activity/useActivityViewModel';
import { useRowActions, type RowActions } from '@/features/record/activity/useRowActions';
import { useSelectedMonth } from '@/state/activityFocus';
import { useMoneyFormatter, type MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { selectComingUp, type ComingUpItem } from './comingUp';
import { useFigureScope } from './useFigureScope';

const NO_SPLITS: SplitsByLine = new Map();

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
  /** 05.5-14 (D-19): the month picture's leftAfterPlans, current month only; null otherwise. */
  afterPlans: { left: MinorUnits } | null;
  /** 08-25 (HH-09): the scope both figures read. Always 'mine' while the switch is hidden. */
  scope: FigureScope;
  setScope(scope: FigureScope): void;
  /** The Mine / Household switch shows only for a household of 2+ people. */
  showScope: boolean;
  /** The currency the card's figures are in: the household currency in Household scope, else home. */
  figureCurrency: string;
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

  // 08-25 (HH-09): Mine is your records plus your stored share of shared lines; Household is shared lines only, in the
  // household currency. Both go through the engine's one adapter (data/queries/figureScope); this screen adds no filter.
  const [chosenScope, setScope] = useFigureScope('home');
  const members = useHouseholdMembers(rc.householdId).data;
  const showScope = (members?.length ?? 0) >= 2;
  const scope: FigureScope = showScope ? chosenScope : 'mine';
  const householdCurrency = useHousehold(rc.householdId).data?.reporting_currency ?? rc.homeCurrency;
  const figureCurrency = scope === 'household' ? householdCurrency : rc.homeCurrency;

  const needsSplits = useMemo(() => rowsNeedSplits(monthView.rows, rc.userId), [monthView.rows, rc.userId]);
  const splitsQuery = useSharedSplits(rc.householdId, scope === 'mine' && needsSplits);
  const splitsWaiting = scope === 'mine' && needsSplits && splitsQuery.data === undefined;
  const splits = splitsQuery.data ?? NO_SPLITS;

  const figures = useMemo(() => {
    if (scope === 'household') {
      const rows = householdMonthRows(monthView.rows);
      return { rows, projections: [], totals: figureTotalsOf(rows, []) };
    }
    const rows = rc.userId === null ? monthView.rows : mineMonthRows(monthView.rows, splits, rc.userId, rc.homeCurrency);
    // the viewer's own lines only: the month view's own totals, unchanged (03.1 D-47 parity with Activity)
    if (rows === monthView.rows) return { rows, projections: monthView.projections, totals: monthView.totals };
    return { rows, projections: monthView.projections, totals: figureTotalsOf(rows, monthView.projections) };
  }, [scope, monthView.rows, monthView.projections, monthView.totals, splits, rc.userId, rc.homeCurrency]);

  const position = useMemo(() => monthPositionOf(figures), [figures]);

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
  const { prepared, source = null } = useDecideV3();
  const currentMonth = monthOf(rc.today);
  const afterPlans = useMemo(() => {
    if (month !== currentMonth) return null;
    // Household: the same builder and month picture over the shared-lines-only source (no second sum).
    if (scope === 'household') return source === null ? null : { left: householdLeftAfterPlans(source, householdCurrency) };
    return prepared !== null ? { left: monthPicture(prepared).leftAfterPlans } : null;
  }, [month, currentMonth, prepared, scope, source, householdCurrency]);
  const dataState: MonthDataState = rc.ready && !splitsWaiting ? monthView.dataState : 'loading';

  return {
    rc,
    formatter,
    month,
    setMonth,
    months,
    totals: figures.totals,
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
    afterPlans,
    scope,
    setScope,
    showScope,
    figureCurrency,
  };
}
