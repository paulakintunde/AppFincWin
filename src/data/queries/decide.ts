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
import { fetchGoalLines, fetchSavingsGoals, type SavingsGoalRow } from '@/db/savingsGoals';
import { fetchStatementPeriods, type StatementPeriodRow } from '@/db/statementPeriods';
import { fetchTransactionsInRange } from '@/db/transactions';
import { monthOf, monthRange } from '@/engine/time';
import { buildDecideSnapshot, type SnapshotSource } from '@/features/decide/snapshot/buildSnapshot';
import { selectOtherChecks } from '@/features/decide/snapshot/stacking';
import { EMPTY_STACK, type SnapshotResult, type StackSelection } from '@/features/decide/snapshot/types';
import { useJudgeOn } from '@/features/decide/judgeOn/judgeOnStore';
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
    queryFn: () => fetchDecideChecks(supabase, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}

function selectOpenChecks(rows: DecideCheckRow[]): DecideCheckRow[] {
  return rows
    .filter((c) => c.deleted_at == null && c.status === 'open')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/**
 * D-88 (R16.4 item 2): the live open checks, newest first, selected with stable equality. TanStack Query structurally
 * shares a `select` result with the previous one, so a draft save in one check gives that row a new object and leaves
 * every other row (and, when nothing changed, the whole array) at its old identity.
 */
export function useOpenChecks(userId?: string, householdId?: string): UseQueryResult<DecideCheckRow[]> {
  return useQuery({
    queryKey: queryKeys.decideChecks(userId ?? '', householdId ?? ''),
    queryFn: () => fetchDecideChecks(supabase, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
    select: selectOpenChecks,
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
    queryFn: () => fetchDebts(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}

export function useStatementPeriods(householdId?: string): UseQueryResult<StatementPeriodRow[]> {
  return useQuery({
    queryKey: queryKeys.statementPeriods(householdId ?? ''),
    queryFn: () => fetchStatementPeriods(supabase, householdId as string),
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

/** D-101 (R18.2): the pots view of the savings_goals rows. */
export interface PotsView {
  /** Not deleted, not done: both kinds, oldest first. The list the Pots screen and the snapshot builder read. */
  live: SavingsGoalRow[];
  /** `kind = 'pot'` rows among `live`: the ones the user adds, edits and deletes here (the 50-pot cap counts these). */
  plain: SavingsGoalRow[];
  /** `kind = 'wait'` rows among `live`: made by a check; only Mark done / Reopen is offered. */
  wait: SavingsGoalRow[];
  /** Done (`done_at` set) and not deleted, newest first. A done pot stops counting. */
  done: SavingsGoalRow[];
}

const doneFirst = (a: SavingsGoalRow, b: SavingsGoalRow): number =>
  (a.done_at ?? '') < (b.done_at ?? '') ? 1 : (a.done_at ?? '') > (b.done_at ?? '') ? -1 : 0;

/** Pure selector (exported for tests). Deleted rows are dropped even if a stale cache still carries one. */
export function selectPots(rows: readonly SavingsGoalRow[]): PotsView {
  const alive = rows.filter((r) => r.deleted_at == null);
  const live = alive.filter((r) => r.done_at == null);
  return {
    live,
    plain: live.filter((r) => r.kind === 'pot'),
    wait: live.filter((r) => r.kind === 'wait'),
    done: alive.filter((r) => r.done_at != null).sort(doneFirst),
  };
}

/** D-101: pots on the savings_goals key (shared cache with useSavingsGoals; structural sharing keeps the view stable). */
export function usePots(userId?: string, householdId?: string): UseQueryResult<PotsView> {
  return useQuery({
    queryKey: queryKeys.savingsGoals(userId ?? '', householdId ?? ''),
    queryFn: () => fetchSavingsGoals(supabase, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
    select: selectPots,
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

// D-88 (R16.4 item 1): one snapshot per source key. Every consumer (quick check, open-checks chips, the flow) builds its own
// `source` from the same cached reads; this memo hands them all the first one built, so the engine runs once per key.
// The key is household, today, home currency and region; the data version is the reads' data references, which TanStack
// Query keeps stable across a refetch that returns equal data (T-05-105-01). A changed or replaced read can never be
// served a stale snapshot, and a refetch that changed nothing does not rebuild.
interface SharedSnapshot {
  key: string;
  deps: readonly unknown[];
  source: SnapshotSource;
  result: SnapshotResult;
}
const SHARED_SNAPSHOTS_MAX = 4;
const sharedSnapshots = new Map<string, SharedSnapshot>();

function sharedSnapshot(key: string, deps: readonly unknown[], source: SnapshotSource): SharedSnapshot {
  const hit = sharedSnapshots.get(key);
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit;
  const entry: SharedSnapshot = { key, deps, source, result: buildDecideSnapshot(source) };
  sharedSnapshots.delete(key);
  sharedSnapshots.set(key, entry);
  if (sharedSnapshots.size > SHARED_SNAPSHOTS_MAX) {
    const oldest = sharedSnapshots.keys().next().value;
    if (oldest !== undefined) sharedSnapshots.delete(oldest);
  }
  return entry;
}

/** Test seam: forget every shared snapshot. */
export function clearSharedSnapshots(): void {
  sharedSnapshots.clear();
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
  const goalsQuery = useSavingsGoals(userKey, hhId);
  const periodsQuery = useStatementPeriods(hhId);
  const changesQuery = useDecideChanges(userKey, hhId);
  const checksQuery = useDecideChecks(userKey, hhId);
  const paymentQuery = useQuery({
    queryKey: queryKeys.decidePaymentLinks(userId ?? '', hh ?? ''),
    queryFn: () => fetchPaymentLinks(supabase, hh as string),
    enabled: enabled && Boolean(userId),
  });
  const writtenQuery = useQuery({
    queryKey: queryKeys.decideWrittenRowLinks(userId ?? '', hh ?? ''),
    queryFn: () => fetchWrittenRowLinks(supabase, hh as string),
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
    goalsQuery,
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
  // D-107: the Judge-on choice (device view). null until it has been read, so no verdict flashes on the wrong basis.
  const { judgeOn } = useJudgeOn(userId);

  const source = useMemo<SnapshotSource | null>(() => {
    if (!rc.ready || missing || judgeOn === null) return null;
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
      goals: goalsQuery.data ?? [], // D-101: pots and Wait goals (kind, done_at); the builder keeps the live, not-done ones
      statementPeriods: periodsQuery.data ?? [],
      customCurrencies: customQuery.data ?? [],
      changes: changesQuery.data ?? [],
      paymentLinks,
      writtenRowLinks: writtenQuery.data ?? [],
      judgeOn,
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
    goalsQuery.data,
    periodsQuery.data,
    customQuery.data,
    changesQuery.data,
    paymentLinks,
    writtenQuery.data,
    judgeOn,
  ]);

  const sourceKey = [hh ?? '', rc.today, rc.homeCurrency, region ?? '', judgeOn ?? ''].join('|');
  const sourceDeps = reads.map((q) => q.data);
  const shared = useMemo(
    () => (source === null ? null : sharedSnapshot(sourceKey, sourceDeps, source)),
    // sourceDeps is rebuilt each render from the same references; `source` and the key say when they changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, sourceKey]
  );
  const result = shared === null ? null : shared.result;
  const sharedSource = shared === null ? null : shared.source;

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
  return { status, result, source: sharedSource, retry };
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

/** 05-22 (D-12): the household's lines in a window, for the attach picker. Row-derived (05-12 key). */
export function useAttachCandidates(householdId: string | null, from: string, toInclusive: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.decideAttachCandidates(householdId ?? '', from, toInclusive),
    queryFn: () => fetchTransactionsInRange(supabase, householdId as string, { from, toInclusive }),
    enabled: enabled && Boolean(householdId),
  });
}
