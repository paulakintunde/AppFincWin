// 05-12: Decide reads. Row-derived reads nest under ['transactions', hh] (D-15). The snapshot is built in
// memory with useMemo, never stored in the cache (it carries bigints, Pitfall 8). Stored rates only.
import { useCallback, useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchDebts, type DebtRow } from '@/db/debts';
import { fetchDecideChanges } from '@/db/decideChanges';
import { fetchDecideChecks, type DecideCheckRow } from '@/db/decideChecks';
import {
  fetchDecideLinks,
  fetchLinkedLines,
  fetchPaymentLinks,
  fetchWrittenRowLinks,
  type DecideLinkRow,
} from '@/db/decideLinks';
import { fetchDecideSettings, type DecideSettingsRow } from '@/db/decideSettings';
import { fetchAccountBalances } from '@/db/recordReads';
import type { TransactionRow } from '@/db/rows';
import { fetchGoalLines, fetchSavingsGoals } from '@/db/savingsGoals';
import { fetchStatementPeriods, type StatementPeriodRow } from '@/db/statementPeriods';
import { fetchTransactionsInRange } from '@/db/transactions';
import { monthOf, monthRange } from '@/engine/time';
import { buildDecideSnapshot, type SnapshotSource } from '@/features/decide/snapshot/buildSnapshot';
import { selectOtherChecks } from '@/features/decide/snapshot/stacking';
import { EMPTY_STACK, type SnapshotResult, type StackSelection } from '@/features/decide/snapshot/types';
import { useRecordContext } from '@/features/record/useRecordContext';
import { getDeviceRegion } from '@/services/locale/deviceLocale';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';
import { useAccounts } from './accounts';
import { useAccountBalances } from './activity';
import { useCategories } from './categories';
import { useCustomCurrencies } from './customCurrencies';
import { useFxLatest } from './fxLatest';
import { useRecurringSeries } from './recurringSeries';

export const DECIDE_LOOKBACK_MONTHS = 12;
export const DECIDE_UPCOMING_MONTHS = 120; // pending one-offs dated after this month (05-06)

export function useDecideChecks(userId?: string, householdId?: string): UseQueryResult<DecideCheckRow[]> {
  return useQuery({
    queryKey: queryKeys.decideChecks(userId ?? '', householdId ?? ''),
    queryFn: () => fetchDecideChecks(supabase),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}

export function useDecideSettings(userId?: string): UseQueryResult<DecideSettingsRow | null> {
  return useQuery({
    queryKey: queryKeys.decideSettings(userId ?? ''),
    queryFn: () => fetchDecideSettings(supabase, userId as string),
    enabled: Boolean(userId),
  });
}

export function useDebts(householdId?: string): UseQueryResult<DebtRow[]> {
  return useQuery({
    queryKey: queryKeys.debts(householdId ?? ''),
    queryFn: () => fetchDebts(supabase),
    enabled: Boolean(householdId),
  });
}

export function useStatementPeriods(householdId?: string): UseQueryResult<StatementPeriodRow[]> {
  return useQuery({
    queryKey: queryKeys.statementPeriods(householdId ?? ''),
    queryFn: () => fetchStatementPeriods(supabase),
    enabled: Boolean(householdId),
  });
}

const NO_IDS: readonly string[] = [];

export function useDecideLinks(
  userId?: string,
  householdId?: string,
  checkIds: readonly string[] = NO_IDS
): UseQueryResult<DecideLinkRow[]> {
  return useQuery({
    queryKey: [...queryKeys.decideLinks(userId ?? '', householdId ?? ''), checkIds.join(',')],
    queryFn: () => fetchDecideLinks(supabase, checkIds),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}

export function useLinkedLines(
  householdId: string | null,
  checkId: string | null,
  ids: { transactionIds: readonly string[]; seriesIds: readonly string[] }
): UseQueryResult<TransactionRow[]> {
  return useQuery({
    queryKey: [
      ...queryKeys.decideLinkedLines(householdId ?? '', checkId ?? ''),
      ids.transactionIds.join(','),
      ids.seriesIds.join(','),
    ],
    queryFn: () => fetchLinkedLines(supabase, householdId as string, ids),
    enabled: Boolean(householdId) && Boolean(checkId),
  });
}

/** D-27: the user's dated income and spending changes. */
export function useDecideChanges(userId?: string, householdId?: string) {
  return useQuery({
    queryKey: queryKeys.decideChanges(userId ?? '', householdId ?? ''),
    queryFn: () => fetchDecideChanges(supabase, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}

/** D-34: savings goals. */
export function useSavingsGoals(userId?: string, householdId?: string) {
  return useQuery({
    queryKey: queryKeys.savingsGoals(userId ?? '', householdId ?? ''),
    queryFn: () => fetchSavingsGoals(supabase, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}

/** D-34: lines tagged to the given goals. Row-derived (under transactionsRoot); disabled for no goals. */
export function useGoalLines(householdId: string | null, goalIds: readonly string[]) {
  const sorted = useMemo(() => [...goalIds].sort(), [goalIds]);
  return useQuery({
    queryKey: queryKeys.goalLines(householdId ?? '', sorted.join(',')),
    queryFn: () => fetchGoalLines(supabase, householdId as string, sorted),
    enabled: Boolean(householdId) && sorted.length > 0,
  });
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${String(year).padStart(4, '0')}-${String(index - year * 12 + 1).padStart(2, '0')}`;
}

function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

export interface DecideSnapshotState {
  status: 'loading' | 'error' | 'ready';
  result: SnapshotResult | null;
  source: SnapshotSource | null; // the assembled builder input (memoised with result); 05-52 rebuilds a bought check's position from it without the check's own writes
  retry: () => void;
}

export function useDecideSnapshot(): DecideSnapshotState {
  const rc = useRecordContext();
  const hh = rc.householdId;
  const userId = rc.userId;
  const hhId = hh ?? undefined;
  const userKey = userId ?? undefined;

  const currentMonth = monthOf(rc.today);
  const from = monthRange(addMonths(currentMonth, -DECIDE_LOOKBACK_MONTHS)).start;
  const to = lastDayOf(currentMonth);
  const upcomingFrom = monthRange(currentMonth).endExclusive; // the day after `to`
  const upcomingTo = lastDayOf(addMonths(currentMonth, DECIDE_UPCOMING_MONTHS));
  const enabled = Boolean(hh);

  const history = useQuery({
    queryKey: queryKeys.decideHistory(hh ?? '', from, to),
    queryFn: () => fetchTransactionsInRange(supabase, hh as string, { from, toInclusive: to }),
    enabled,
  });
  const upcoming = useQuery({
    queryKey: queryKeys.decideUpcoming(hh ?? '', upcomingFrom),
    queryFn: () => fetchTransactionsInRange(supabase, hh as string, { from: upcomingFrom, toInclusive: upcomingTo }),
    enabled,
  });
  const accountsQuery = useAccounts(hhId);
  const allAccounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const { balances } = useAccountBalances(hh, allAccounts);
  // Same key as useAccountBalances' read (shared, not refetched): only here for its error and loaded state.
  const balanceRead = useQuery({
    queryKey: queryKeys.accountBalances(hh ?? ''),
    queryFn: () => fetchAccountBalances(supabase, hh as string),
    enabled,
  });
  const seriesQuery = useRecurringSeries(hhId);
  const fxQuery = useFxLatest();
  const categoriesQuery = useCategories(userKey);
  const customQuery = useCustomCurrencies(userKey);
  const settingsQuery = useDecideSettings(userKey);
  const debtsQuery = useDebts(hhId);
  const periodsQuery = useStatementPeriods(hhId);
  const changesQuery = useDecideChanges(userKey, hhId);
  const checksQuery = useDecideChecks(userKey, hhId);
  const paymentQuery = useQuery({
    queryKey: queryKeys.decidePaymentLinks(userId ?? '', hh ?? ''),
    queryFn: () => fetchPaymentLinks(supabase),
    enabled: enabled && Boolean(userId),
  });
  const writtenQuery = useQuery({
    queryKey: queryKeys.decideWrittenRowLinks(userId ?? '', hh ?? ''),
    queryFn: () => fetchWrittenRowLinks(supabase),
    enabled: enabled && Boolean(userId),
  });

  const reads = [
    history,
    upcoming,
    accountsQuery,
    balanceRead,
    seriesQuery,
    fxQuery,
    categoriesQuery,
    customQuery,
    settingsQuery,
    debtsQuery,
    periodsQuery,
    changesQuery,
    checksQuery,
    paymentQuery,
    writtenQuery,
  ];
  const missing = reads.some((q) => q.data === undefined);
  // 'error' only when a required read failed with nothing cached; a cached copy (offline) is 'ready'.
  const failed = reads.some((q) => q.data === undefined && q.isError);

  const checkRows = checksQuery.data;
  const paymentLinks = useMemo(() => {
    const kinds = new Map((checkRows ?? []).map((c) => [c.id, c.kind] as const));
    const out: SnapshotSource['paymentLinks'][number][] = [];
    for (const link of paymentQuery.data ?? []) {
      const kind = kinds.get(link.check_id);
      if (kind !== undefined) out.push({ check_id: link.check_id, target_id: link.target_id, check_kind: kind });
    }
    return out;
  }, [checkRows, paymentQuery.data]);

  const balanceRecord = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, view] of balances) if (view.balance !== null) out[id] = view.balance;
    return out;
  }, [balances]);

  const categoryRows = categoriesQuery.data;
  const categoryMap = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const c of categoryRows ?? []) out[c.id] = c.builtin_key;
    return out;
  }, [categoryRows]);

  const region = getDeviceRegion(rc.region) ?? null;

  const source = useMemo<SnapshotSource | null>(() => {
    if (!rc.ready || missing) return null;
    return {
      today: rc.today,
      homeCurrency: rc.homeCurrency,
      region,
      rows: history.data ?? [],
      upcomingRows: upcoming.data ?? [],
      series: seriesQuery.data ?? [],
      accounts: allAccounts,
      balances: balanceRecord,
      rates: fxQuery.data ?? [],
      categories: categoryMap,
      settings: settingsQuery.data ?? null,
      debts: debtsQuery.data ?? [],
      statementPeriods: periodsQuery.data ?? [],
      customCurrencies: customQuery.data ?? [],
      changes: changesQuery.data ?? [],
      paymentLinks,
      writtenRowLinks: writtenQuery.data ?? [],
    };
  }, [
    rc.ready,
    rc.today,
    rc.homeCurrency,
    missing,
    region,
    history.data,
    upcoming.data,
    seriesQuery.data,
    allAccounts,
    balanceRecord,
    fxQuery.data,
    categoryMap,
    settingsQuery.data,
    debtsQuery.data,
    periodsQuery.data,
    customQuery.data,
    changesQuery.data,
    paymentLinks,
    writtenQuery.data,
  ]);

  const result = useMemo(() => (source === null ? null : buildDecideSnapshot(source)), [source]);

  const refetches = reads.map((q) => q.refetch);
  const failedFlags = reads.map((q) => q.isError).join(',');
  const retry = useCallback(() => {
    const flags = failedFlags.split(',');
    refetches.forEach((refetch, i) => {
      if (flags[i] === 'true') void refetch();
    });
    // refetch functions are stable per query; failedFlags keys the callback to the failure set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failedFlags]);

  const status: DecideSnapshotState['status'] = failed ? 'error' : result === null ? 'loading' : 'ready';
  return { status, result, source, retry };
}

/** D-24 (part 2): the other open checks a check is judged with, counted and memoised. */
export function useOtherChecks(excludeId: string | null): StackSelection {
  const rc = useRecordContext();
  const { result } = useDecideSnapshot();
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  return useMemo(
    () =>
      result === null || checks === undefined
        ? EMPTY_STACK
        : selectOtherChecks({ checks, excludeId, source: result, today: rc.today }),
    [result, checks, excludeId, rc.today]
  );
}
