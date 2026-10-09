// Activity's state in one place (ACT-06..ACT-10): month, search, filter, view, sort, the item
// list and the running-balance inputs. ActivityScreen composes; it holds no list state.
// All maths is the engine's (monthTotals, groupBy*, runningBalance); this hook gathers inputs.
// Read paths never fetch exchange rates (02-48 rule): a missing rate shows as 'Waiting for a rate'.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccounts } from '@/data/queries/accounts';
import {
  useMonthView,
  useTransactionMonths,
  useTransactionsSearch,
  type ActivityRowView,
} from '@/data/queries/activity';
import { useFxLatest } from '@/data/queries/fxLatest';
import { projectionHomeAmount } from '@/data/queries/homeAmount';
import { usePaidBefore } from '@/data/queries/pendingSplit';
import {
  EMPTY_FILTER,
  filterRows,
  isFilterActive,
  matchesSearch,
  monthTotals,
  runningBalance,
  type ActivityFilter,
  type MonthTotals,
  type RunningRow,
  type SortKey,
} from '@/engine/activity';
import { money } from '@/engine/money';
import { monthOf } from '@/engine/time';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import {
  buildFlatItems,
  buildViewItems,
  cardPositions,
  type ActivityItem,
  type ActivityListView,
  type CardPositionOf,
  type RowBalance,
} from './activitySections';
import {
  DEFAULT_VIEW_PREFS,
  loadViewPrefs,
  saveViewPrefs,
  type ActivityView,
} from './activityViewPrefs';
import type { SearchScope } from './SearchBar';
import { useActivitySelection } from './useActivitySelection';

export type { ActivityView } from './activityViewPrefs';

export type BalanceNote = { kind: 'after'; text: string } | { kind: 'notCounted' };

export interface ActivityViewModelInput {
  initialMonth?: string;
  supportedViews: readonly ActivityView[];
}

export function useActivityViewModel({ initialMonth, supportedViews }: ActivityViewModelInput) {
  const t = useT();
  const rc = useRecordContext();
  const formatter = useMoneyFormatter(rc.showCents);
  const weekStart: 0 | 1 = rc.weekStart ?? 1;

  const [month, setMonth] = useState(() => initialMonth ?? monthOf(rc.today));
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<SearchScope>('month');
  const [filter, setFilter] = useState<ActivityFilter>(EMPTY_FILTER);
  const [prefs, setPrefs] = useState(DEFAULT_VIEW_PREFS);

  useEffect(() => {
    let live = true;
    void loadViewPrefs().then((p) => {
      if (live) setPrefs(p);
    });
    return () => {
      live = false;
    };
  }, []);

  const view: ActivityView = supportedViews.includes(prefs.view) ? prefs.view : 'list';
  const sort: SortKey = prefs.sort;
  const setView = useCallback((next: ActivityView) => {
    setPrefs((p) => {
      const n = { ...p, view: next };
      void saveViewPrefs(n);
      return n;
    });
  }, []);
  const setSort = useCallback((next: SortKey) => {
    setPrefs((p) => {
      const n = { ...p, sort: next };
      void saveViewPrefs(n);
      return n;
    });
  }, []);

  const monthView = useMonthView({ householdId: rc.householdId, homeCurrency: rc.homeCurrency, today: rc.today }, month);
  const { months } = useTransactionMonths(rc.householdId, rc.today);
  const accounts = useAccounts(rc.householdId ?? undefined).data;

  // ACT-03: a 2+ character term in Every month scope is a server search; shorter terms leave
  // the month list alone. Month scope narrows the loaded month instantly.
  const search = useTransactionsSearch(rc.householdId, scope === 'all' ? term : '', rc.homeCurrency, rc.today);
  const flat = scope === 'all' && search.enabled;
  const searching = scope === 'month' ? term.trim() !== '' : flat;
  const filtering = isFilterActive(filter);
  const narrowed = useMemo(() => {
    let base: ActivityRowView[] = flat ? search.rows : monthView.rows;
    if (scope === 'month' && term.trim() !== '') base = base.filter((r) => matchesSearch(r, term));
    return filterRows(base, filter);
  }, [flat, search.rows, monthView.rows, scope, term, filter]);

  // ACT-10: the count (and the figures beside it) follow the filtered set.
  const totals: MonthTotals = useMemo(
    () =>
      searching || filtering
        ? monthTotals(
            narrowed.map((r) => ({
              amountHome: r.amountHome,
              status: r.status,
              isTransfer: r.transfer_id !== null,
              isRefund: r.is_refund,
            })),
            []
          )
        : monthView.totals,
    [searching, filtering, narrowed, monthView.totals]
  );

  // ---- Running balance inputs (D-25) -------------------------------------------------------
  const wantBalance = view === 'balance' && !flat;
  const paidBefore = usePaidBefore(rc.householdId, wantBalance ? `${month}-01` : null);
  const rates = useFxLatest().data;
  const singleAccountId = filter.accountIds !== null && filter.accountIds.length === 1 ? filter.accountIds[0]! : null;

  const balance = useMemo(() => {
    if (!wantBalance) return null;
    const live = (accounts ?? []).filter((a) => a.deleted_at === null);
    let opening = 0;
    let paidBeforeMonth = '0';
    let inexact = false;
    let rowsIn: RunningRow[];
    let currency = rc.homeCurrency;
    const asRunning = (r: ActivityRowView, amount: number | null): RunningRow => ({
      id: r.id,
      local_date: r.local_date,
      created_at: r.created_at,
      status: r.status,
      amount,
    });
    const single = singleAccountId === null ? undefined : live.find((a) => a.id === singleAccountId);
    if (single !== undefined) {
      currency = single.currency;
      opening = single.opening_balance;
      const leg = paidBefore.legs.find((l) => l.accountId === single.id && l.currency === single.currency);
      paidBeforeMonth = leg?.paidSum ?? '0';
      rowsIn = monthView.rows
        .filter((r) => r.account_id === single.id)
        .map((r) =>
          asRunning(
            r,
            r.original_currency === single.currency
              ? r.original_amount
              : single.currency === rc.homeCurrency
                ? r.amountHome
                : null
          )
        );
    } else {
      let before = BigInt(0);
      for (const a of live) {
        const converted = projectionHomeAmount(a.opening_balance, a.currency, rc.homeCurrency, rates ?? []);
        if (converted === null) inexact = true;
        else opening += converted;
      }
      for (const l of paidBefore.legs) {
        if (l.unconverted > 0) inexact = true;
        before += BigInt(l.paidHomeSum);
      }
      paidBeforeMonth = before.toString();
      rowsIn = monthView.rows.map((r) => asRunning(r, r.amountHome));
    }
    if (inexact) return { steps: new Map<string, RowBalance>(), currency, allAccounts: single === undefined, inexact: true };
    const result = runningBalance({ opening, paidBeforeMonth, rows: rowsIn });
    const steps = new Map<string, RowBalance>(result.steps.map((s) => [s.id, { moves: s.moves, after: s.after }]));
    return { steps, currency, allAccounts: single === undefined, inexact: !result.exact || result.overflow };
  }, [wantBalance, accounts, singleAccountId, paidBefore.legs, monthView.rows, rates, rc.homeCurrency]);

  const items: ActivityItem[] = useMemo(() => {
    if (flat) return buildFlatItems(narrowed);
    const listView: ActivityListView = view === 'calendar' ? 'list' : view;
    return buildViewItems({
      view: listView,
      rows: narrowed,
      projections: searching || filtering ? [] : monthView.projections,
      sort,
      month,
      weekStart,
      balanceSteps: balance?.steps,
    });
  }, [flat, narrowed, view, sort, searching, filtering, monthView.projections, month, weekStart, balance]);

  const positions: (CardPositionOf | null)[] = useMemo(() => cardPositions(items), [items]);
  const itemRows = useMemo(() => items.flatMap((i) => (i.type === 'row' ? [i.row] : [])), [items]);
  const selection = useActivitySelection(useMemo(() => itemRows.map((r) => r.id), [itemRows]));

  const balanceNotes: ReadonlyMap<string, BalanceNote> = useMemo(() => {
    const notes = new Map<string, BalanceNote>();
    if (balance === null || balance.inexact) return notes;
    for (const item of items) {
      if (item.type !== 'row' || item.balance === undefined) continue;
      if (item.row.status === 'pending') notes.set(item.row.id, { kind: 'notCounted' });
      else if (item.balance.moves && item.balance.after !== null) {
        notes.set(item.row.id, {
          kind: 'after',
          text: t('activity.balance.after', {
            date: formatter.formatDate(item.row.local_date, 'short'),
            amount: formatter.formatMoney(money(item.balance.after, balance.currency)),
          }),
        });
      }
    }
    return notes;
  }, [balance, items, t, formatter]);

  return {
    month,
    setMonth,
    months,
    term,
    setTerm,
    scope,
    setScope,
    filter,
    setFilter,
    filtering,
    searching,
    flat,
    search,
    view,
    setView,
    sort,
    setSort,
    totals,
    monthView,
    items,
    positions,
    itemRows,
    selection,
    balanceNotes,
    balanceHeader: wantBalance && balance !== null ? { allAccounts: balance.allAccounts, inexact: balance.inexact } : undefined,
    accounts,
    formatter,
    rc,
  };
}
