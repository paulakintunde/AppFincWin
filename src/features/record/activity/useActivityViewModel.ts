// Activity's state in one place (ACT-06..ACT-10): month, search, filter, view, sort, the item
// list and the running-balance inputs. ActivityScreen composes; it holds no list state.
// All maths is the engine's (monthTotals, groupBy*, runningBalance); this hook gathers inputs.
// Read paths never fetch exchange rates (02-48 rule): a missing rate shows as 'Waiting for a rate'.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccounts } from '@/data/queries/accounts';
import { useAddMonth } from '@/data/mutations/addMonth';
import { useSeriesOffers } from '@/data/queries/offers';
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
  addableMonth,
  type SortKey,
} from '@/engine/activity';
import { money } from '@/engine/money';
import { monthOf } from '@/engine/time';
import type { EntryMode } from '@/features/record/entry/transactionForm';
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
import { previousMonth } from './CloneMonthSheet';
import { useActivitySelection } from './useActivitySelection';
import type { DeletePrompt, RowActions } from './useRowActions';
import { showToast } from '@/state/undoToast';

export type { ActivityView } from './activityViewPrefs';

export type BalanceNote = { kind: 'after'; text: string } | { kind: 'notCounted' };

export interface ActivityViewModelInput {
  initialMonth?: string;
  supportedViews: readonly ActivityView[];
}

/**
 * ACT-13/ACT-14: the detail sheet, the entry sheet target and the pending delete prompt for the
 * Activity rows. `rowActions` (useRowActions) does the writes; this holds the sheet state.
 */
export function useRowFlow(rowActions: RowActions, month: string) {
  const [entryMode, setEntryMode] = useState<EntryMode | null>(null);
  const [detailRow, setDetailRow] = useState<ActivityRowView | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ row: ActivityRowView; prompt: DeletePrompt } | null>(null);

  const openDetail = useCallback((row: ActivityRowView) => {
    setDetailRow(row);
    setDetailOpen(true);
  }, []);
  const closeDetail = useCallback(() => setDetailOpen(false), []);
  const detail = {
    row: detailRow,
    visible: detailOpen,
    onDismiss: closeDetail,
    onStatus: (next: 'paid' | 'pending') => {
      if (detailRow !== null) (next === 'paid' ? rowActions.pay : rowActions.unpay)(detailRow);
      setDetailOpen(false);
    },
    onEdit: () => {
      if (detailRow !== null) setEntryMode({ kind: 'edit', row: detailRow });
      setDetailOpen(false);
    },
    onClone: () => {
      if (detailRow !== null) setEntryMode(rowActions.cloneMode(detailRow, month));
      setDetailOpen(false);
    },
    onDelete: () => {
      setDetailOpen(false);
      if (detailRow === null) return;
      const prompt = rowActions.remove(detailRow);
      if (prompt !== null) setPendingDelete({ row: detailRow, prompt: prompt.prompt });
    },
  };
  const requestDelete = useCallback(
    (row: ActivityRowView) => {
      const prompt = rowActions.remove(row);
      if (prompt !== null) setPendingDelete({ row, prompt: prompt.prompt });
    },
    [rowActions]
  );
  const answerDelete = (answer: 'one' | 'future' | 'transfer' | 'cancel') => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (target === null || answer === 'cancel') return;
    if (answer === 'one') rowActions.deleteThisOne(target.row);
    else if (answer === 'future') rowActions.deleteThisAndFuture(target.row);
    else rowActions.deleteTransfer(target.row);
  };

  return { entryMode, setEntryMode, openDetail, detail, requestDelete, pendingDelete, answerDelete };
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
  const { months, counts } = useTransactionMonths(rc.householdId, rc.today, rc.horizonMonth ?? null);
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

  // ---- Row actions, detail sheet, offers and month tools (plan 34) ---------------------------
  // D-17: the offer sits above the first group in the list views, not in Calendar or search.
  const seriesOffers = useSeriesOffers({ householdId: rc.householdId, userId: rc.userId }, month);
  const offers = view === 'calendar' || searching || flat ? [] : seriesOffers.offers;

  const [reviewOpen, setReviewOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  const prevMonth = previousMonth(month);
  const monthNameOf = useCallback(
    (m: string) =>
      new Intl.DateTimeFormat(formatter.locale, { month: 'long', timeZone: 'UTC' }).format(
        Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1)
      ),
    [formatter.locale]
  );
  // REC-19: "earliest" means no earlier month holds a line to clone from.
  const hasEarlier = useMemo(() => [...counts].some(([m, n]) => m < month && n > 0), [counts, month]);
  const addMonth = addableMonth(rc.today, rc.horizonMonth ?? null);
  const { add: addMonthMutation } = useAddMonth();
  const onAddMonth = () => {
    if (addMonth === null || rc.householdId === null || rc.userId === null) return;
    addMonthMutation({
      householdId: rc.householdId,
      ownerId: rc.userId,
      today: rc.today,
      horizonMonth: rc.horizonMonth ?? null,
      monthLabel: monthNameOf(addMonth),
    });
    setMonth(addMonth);
  };
  const openClone = () => {
    if (hasEarlier) setCloneOpen(true);
    else showToast({ kind: 'info', text: { key: 'activity.clone.earliest', params: { month: monthNameOf(month) } } });
  };
  const openPaste = () => setPasteOpen(true);
  const monthTools = {
    counts,
    addMonth,
    onAddMonth,
    prevMonthName: monthNameOf(prevMonth),
    hasEarlier,
    cloneOpen,
    pasteOpen,
    openClone,
    openPaste,
    closeClone: () => setCloneOpen(false),
    closePaste: () => setPasteOpen(false),
  };

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
    offers,
    rowsById: seriesOffers.rowsById,
    reviewOpen,
    setReviewOpen,
    monthTools,
  };
}
