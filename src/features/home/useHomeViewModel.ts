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
import { queryKeys } from '@/data/keys';
import type { AccountRow } from '@/db/rows';
import {
  monthPosition,
  type MonthFigureProjection,
  type MonthFigureRow,
  type MonthPosition,
  type MonthTotals,
} from '@/engine/activity';
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

  const figureRows: MonthFigureRow[] = useMemo(
    () =>
      monthView.rows.map((r) => ({
        status: r.status,
        isTransfer: r.transfer_id !== null,
        isRefund: r.is_refund,
        originalAmount: r.original_amount,
        amountHome: r.amountHome,
      })),
    [monthView.rows]
  );
  const figureProjections: MonthFigureProjection[] = useMemo(
    () => monthView.projections.map((p) => ({ amount: p.amount, amountHome: p.amountHome })),
    [monthView.projections]
  );
  const position = useMemo(
    () => monthPosition(monthView.totals, figureRows, figureProjections),
    [monthView.totals, figureRows, figureProjections]
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
  const refreshKeys: readonly QueryKey[] = useMemo(
    () =>
      hh === null || hh === undefined
        ? []
        : [
            queryKeys.transactionsMonth(hh, month),
            queryKeys.recurringSeries(hh),
            queryKeys.fxLatest(),
            queryKeys.transactionMonths(hh),
            queryKeys.accounts(hh),
            queryKeys.accountBalances(hh),
          ],
    [hh, month]
  );

  return {
    rc,
    formatter,
    month,
    setMonth,
    months,
    totals: monthView.totals,
    position,
    loading: monthView.isLoading || !rc.ready,
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
