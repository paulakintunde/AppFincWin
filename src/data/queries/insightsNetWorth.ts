// 07-07 (INS-01, D-07..D-11, D-22, D-23): net worth worked back from records. No new table, no migration; security-invoker RPC reads only.
// Past month-ends come from account_paid_before(first day of the next month) plus each account's opening balance; today comes
// from the same balances the Accounts screen shows (paid lines only, never pending). Anything that cannot be converted at
// today's rates is left out and counted, never guessed (D-11).
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchAccountPaidBefore } from '@/db/recordReads';
import type { CustomCurrencyRow, FxLatestRow, AccountRow } from '@/db/rows';
import type { DebtRow } from '@/db/debts';
import type { HoldingRow } from '@/db/holdings';
import type { HoldingLotRow } from '@/db/holdingLots';
import { accountBalance } from '@/engine/activity';
import {
  monthEndsFor,
  netWorthSeries,
  seriesChange,
  type PointSource,
  type SeriesAccount,
  type SeriesDebt,
  type SeriesHolding,
  type SeriesPoint,
  type SeriesRange,
} from '@/engine/grow';
import { useRecordContext } from '@/features/record/useRecordContext';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';
import { useAccounts } from './accounts';
import { useAccountBalances, useTransactionMonths } from './activity';
import { useCustomCurrencies } from './customCurrencies';
import { useDebts } from './decide';
import type { FigureScope } from './figureScope';
import { convertLatest } from './fxConvert';
import { useFxLatest } from './fxLatest';
import { useHoldingLotRows, useHoldingRows } from './growHoldings';

type Rates = readonly FxLatestRow[];
type Customs = readonly CustomCurrencyRow[];

/** The date account_paid_before takes for a month-end: the first day of the next month. */
export function paidBeforeDateOf(monthEnd: string): string {
  const d = new Date(`${monthEnd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** D-23: Just me = my own personal accounts; Household = joint accounts only. Deleted accounts are dropped in both. */
export function accountsForScope(accounts: readonly AccountRow[], scope: FigureScope, viewerId: string | null): AccountRow[] {
  return accounts.filter((a) => {
    if (a.deleted_at) return false;
    if (scope === 'household') return a.is_shared === true;
    return a.is_shared !== true && (a.created_by === null || viewerId === null || a.created_by === viewerId);
  });
}

export interface NetWorthBuild {
  accounts: SeriesAccount[];
  holdings: SeriesHolding[];
  debts: SeriesDebt[];
  /** Holdings and debts left out (no rate); their sum is `unconverted`. */
  unconverted: number;
  unconvertedHoldings: number;
  unconvertedDebts: number;
}

export function buildNetWorthInputs(args: {
  scope: FigureScope;
  accounts: readonly AccountRow[];
  holdings: readonly HoldingRow[];
  lots: readonly HoldingLotRow[];
  debts: readonly DebtRow[];
  currency: string;
  rates: Rates;
  customs: Customs;
  today: string;
  /** IN-07: joint (shared) account ids. Household counts such an account's own balance, so Just me leaves a holding in one out. */
  jointAccountIds?: ReadonlySet<string>;
}): NetWorthBuild {
  const { currency, rates, customs, today } = args;
  const accounts: SeriesAccount[] = args.accounts.map((a) => ({
    id: a.id,
    kind: a.kind,
    deleted_at: a.deleted_at,
    createdOn: a.created_at.slice(0, 10),
  }));
  if (args.scope === 'household') return { accounts, holdings: [], debts: [], unconverted: 0, unconvertedHoldings: 0, unconvertedDebts: 0 };

  const conv = (amount: number, from: string): number | null => convertLatest(amount, from, currency, rates, customs, today)?.amount ?? null;
  let unconvertedHoldings = 0;
  let unconvertedDebts = 0;

  const holdings: SeriesHolding[] = [];
  for (const h of args.holdings) {
    if (h.deleted_at) continue;
    if (h.account_id !== null && args.jointAccountIds?.has(h.account_id)) continue;
    const raw = [
      ...args.lots.filter((l) => l.holding_id === h.id && l.kind === 'value' && !l.deleted_at).map((l) => ({ date: l.local_date, amount: l.amount })),
      { date: h.value_as_of, amount: h.value },
    ];
    const lots: { date: string; amount: number }[] = [];
    let failed = false;
    for (const l of raw) {
      const amount = conv(l.amount, h.currency);
      if (amount === null) {
        failed = true;
        break;
      }
      lots.push({ date: l.date, amount });
    }
    if (failed) {
      unconvertedHoldings += 1;
      continue;
    }
    holdings.push({ id: h.id, account_id: h.account_id, deleted_at: h.deleted_at, lots });
  }

  const debts: SeriesDebt[] = [];
  for (const d of args.debts) {
    if (d.deleted_at) continue;
    const balance = conv(d.balance, d.currency);
    const started = d.started_balance === null || d.started_balance === undefined ? null : conv(d.started_balance, d.currency);
    if (balance === null || (d.started_balance != null && started === null)) {
      unconvertedDebts += 1;
      continue;
    }
    debts.push({ account_id: d.account_id, balance, startedBalance: started, paidOffOn: d.paid_off_on ?? null, deleted_at: d.deleted_at });
  }
  return { accounts, holdings, debts, unconverted: unconvertedHoldings + unconvertedDebts, unconvertedHoldings, unconvertedDebts };
}

/** One account's balance in the target currency from its own-currency balance plus other-currency subtotals; null when any part cannot convert. */
function convertedBalance(
  account: Pick<AccountRow, 'currency'>,
  own: number | null,
  others: readonly { currency: string; paidSum: number }[],
  currency: string,
  rates: Rates,
  customs: Customs,
  today: string
): number | null {
  if (own === null) return null;
  let sum = BigInt(0);
  const parts: [number, string][] = [[own, account.currency], ...others.map((o): [number, string] => [o.paidSum, o.currency])];
  for (const [amount, from] of parts) {
    const c = convertLatest(amount, from, currency, rates, customs, today);
    if (c === null) return null;
    sum += BigInt(c.amount);
  }
  const out = Number(sum);
  return Number.isSafeInteger(out) ? out : null;
}

export function pointBalances(args: {
  accounts: readonly AccountRow[];
  legs: readonly { accountId: string; currency: string; paidSum: string }[];
  currency: string;
  rates: Rates;
  customs: Customs;
  today: string;
}): { balances: Map<string, number>; accountsWithLegs: Set<string>; unconvertedIds: Set<string> } {
  const balances = new Map<string, number>();
  const accountsWithLegs = new Set<string>();
  const unconvertedIds = new Set<string>();
  const byAccount = new Map<string, { currency: string; paidSum: string }[]>();
  for (const l of args.legs) {
    accountsWithLegs.add(l.accountId);
    const list = byAccount.get(l.accountId);
    if (list) list.push({ currency: l.currency, paidSum: l.paidSum });
    else byAccount.set(l.accountId, [{ currency: l.currency, paidSum: l.paidSum }]);
  }
  for (const a of args.accounts) {
    const b = accountBalance({ openingBalance: a.opening_balance, currency: a.currency, legs: byAccount.get(a.id) ?? [] });
    const value = convertedBalance(a, b.balance, b.otherCurrencies, args.currency, args.rates, args.customs, args.today);
    if (value === null) unconvertedIds.add(a.id);
    else balances.set(a.id, value);
  }
  return { balances, accountsWithLegs, unconvertedIds };
}

export interface NetWorthSeriesState {
  /** NR-01: 'offline' when an input has no answer, the device is offline and nothing is cached; never a partial figure. */
  status: 'loading' | 'offline' | 'error' | 'ready';
  points: SeriesPoint[];
  current: number | null;
  change: { from: number; to: number; change: number } | null;
  /** Total left out, and by kind (WR-01): the note names what was actually dropped. */
  unconverted: number;
  unconvertedAccounts: number;
  unconvertedHoldings: number;
  unconvertedDebts: number;
  debtsHeldFlat: boolean;
  holdingsLeftOut: boolean;
  noAccounts: boolean;
  retry(): void;
}

const NO_ACCOUNTS: AccountRow[] = [];
const NO_RATES: FxLatestRow[] = [];
const NO_CUSTOMS: CustomCurrencyRow[] = [];
const NO_HOLDINGS: HoldingRow[] = [];
const NO_LOTS: HoldingLotRow[] = [];
const NO_DEBTS: DebtRow[] = [];

/** The parts of a query result the status reads; a mock or a hook may leave fetchStatus out. */
interface InputRead {
  data?: unknown;
  isError?: boolean;
  fetchStatus?: string;
}
/**
 * NR-01: no answer yet and one may still come. TanStack's isLoading is false while a query is paused offline
 * (networkMode offlineFirst), so the test is "no data, no error, not idle". A disabled query is idle and not waited on.
 */
export function inputWaiting(q: InputRead): boolean {
  return q.data === undefined && q.isError !== true && q.fetchStatus !== 'idle';
}
/** NR-01: no answer, paused offline with nothing cached. */
export function inputPaused(q: InputRead): boolean {
  return q.data === undefined && q.isError !== true && q.fetchStatus === 'paused';
}

export function useNetWorthSeries(args: { range: SeriesRange; scope: FigureScope; currency: string }): NetWorthSeriesState {
  const { range, scope, currency } = args;
  const rc = useRecordContext();
  const hh = rc.householdId;
  const accountsQuery = useAccounts(hh ?? undefined);
  const monthsRead = useTransactionMonths(hh, rc.today);
  const fx = useFxLatest();
  const customsQuery = useCustomCurrencies(rc.userId ?? undefined);
  const holdingsQuery = useHoldingRows(rc.userId ?? undefined, hh ?? undefined);
  const lotsQuery = useHoldingLotRows(rc.userId ?? undefined, hh ?? undefined);
  const debtsQuery = useDebts(hh ?? undefined);

  const allAccounts = accountsQuery.data ?? NO_ACCOUNTS;
  const accounts = useMemo(() => accountsForScope(allAccounts, scope, rc.userId), [allAccounts, scope, rc.userId]);
  const { balances: todayViews, isWaiting: balancesWaiting, isPaused: balancesPaused, isError: balancesError } = useAccountBalances(hh, accounts);
  const rates = fx.data ?? NO_RATES;
  const customs = customsQuery.data ?? NO_CUSTOMS;
  const holdings = holdingsQuery.data ?? NO_HOLDINGS;
  const lots = lotsQuery.data ?? NO_LOTS;
  const debts = debtsQuery.data ?? NO_DEBTS;

  const jointAccountIds = useMemo(() => new Set(allAccounts.filter((a) => a.is_shared === true && !a.deleted_at).map((a) => a.id)), [allAccounts]);
  const build = useMemo(
    () => buildNetWorthInputs({ scope, accounts, holdings, lots, debts, currency, rates, customs, today: rc.today, jointAccountIds }),
    [scope, accounts, holdings, lots, debts, currency, rates, customs, rc.today, jointAccountIds]
  );

  const firstMonth = useMemo(() => {
    let first: string | null = null;
    for (const m of monthsRead.months) {
      if ((monthsRead.counts.get(m) ?? 0) > 0 && (first === null || m < first)) first = m;
    }
    if (scope === 'mine') {
      const consider = (date: string): void => {
        const m = date.slice(0, 7);
        if (first === null || m < first) first = m;
      };
      for (const h of holdings) if (!h.deleted_at) consider(h.value_as_of);
      for (const l of lots) if (l.kind === 'value' && !l.deleted_at) consider(l.local_date);
    }
    return first;
  }, [monthsRead.months, monthsRead.counts, scope, holdings, lots]);

  const ends = useMemo(() => monthEndsFor(rc.today, firstMonth, range), [rc.today, firstMonth, range]);
  const reads = useQueries({
    queries: ends.map((e) => ({
      queryKey: queryKeys.paidBefore(hh ?? '', paidBeforeDateOf(e)),
      queryFn: () => fetchAccountPaidBefore(supabase, hh as string, paidBeforeDateOf(e)),
      enabled: Boolean(hh),
    })),
  });

  const accountIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts]);
  const dataKey = reads.map((r) => r.dataUpdatedAt).join(',');
  // CR-01: every input the figure depends on gates the status, so a partial figure is never shown as final.
  // Scope Household uses neither debts nor holdings, so their reads do not hold it back.
  const inputReads = [accountsQuery, fx, customsQuery, ...(scope === 'mine' ? [debtsQuery, holdingsQuery, lotsQuery] : [])];
  // NR-01: an input with no data is never treated as loaded. isLoading misses the paused-offline case, so this reads data itself.
  const anyLoading =
    reads.some((r) => r.data === undefined && !r.isError) || monthsRead.isWaiting || balancesWaiting || inputReads.some(inputWaiting);
  const anyPaused = reads.some(inputPaused) || monthsRead.isPaused || balancesPaused || inputReads.some(inputPaused);
  const anyError =
    reads.some((r) => r.isError && r.data === undefined) || balancesError || inputReads.some((q) => q.isError === true && q.data === undefined);

  const computed = useMemo(() => {
    const unconvertedIds = new Set<string>();
    const sources: PointSource[] = [];
    ends.forEach((e, i) => {
      const legs = (reads[i]?.data ?? []).filter((l) => accountIds.has(l.accountId));
      const p = pointBalances({ accounts, legs, currency, rates, customs, today: rc.today });
      p.unconvertedIds.forEach((id) => unconvertedIds.add(id));
      sources.push({ date: e, isToday: false, balances: p.balances, accountsWithLegs: p.accountsWithLegs });
    });
    const todayBalances = new Map<string, number>();
    for (const a of accounts) {
      const v = todayViews.get(a.id);
      if (!v) continue;
      const value = convertedBalance(a, v.balance, v.otherCurrencies, currency, rates, customs, rc.today);
      if (value === null) unconvertedIds.add(a.id);
      else todayBalances.set(a.id, value);
    }
    sources.push({ date: rc.today, isToday: true, balances: todayBalances, accountsWithLegs: accountIds });
    const points = netWorthSeries({ accounts: build.accounts, holdings: build.holdings, debts: build.debts, points: sources });
    return { points, unconvertedAccounts: unconvertedIds.size };
    // dataKey stands in for the per-query data objects, which useQueries re-creates each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ends, dataKey, accounts, accountIds, currency, rates, customs, rc.today, todayViews, build]);

  const status: NetWorthSeriesState['status'] = anyError ? 'error' : anyPaused ? 'offline' : anyLoading ? 'loading' : 'ready';
  const points = computed.points;
  const retry = (): void => {
    reads.forEach((r) => void r.refetch());
    for (const q of inputReads) void q.refetch?.();
  };
  return {
    status,
    points,
    current: points.length > 0 ? points[points.length - 1]!.value : null,
    change: seriesChange(points),
    unconverted: computed.unconvertedAccounts + build.unconverted,
    unconvertedAccounts: computed.unconvertedAccounts,
    unconvertedHoldings: build.unconvertedHoldings,
    unconvertedDebts: build.unconvertedDebts,
    debtsHeldFlat: points.some((p) => p.debtsHeldFlat),
    holdingsLeftOut: points.some((p) => p.holdingsLeftOut > 0),
    noAccounts: accounts.length === 0,
    retry,
  };
}
