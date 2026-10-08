// Every Phase 2 Activity/Accounts read hook (ACT-01..05, REC-08, REC-17, D-49, D-50): a
// month's view (rows plus recurring projections and totals), the month switcher, cross-month
// search, per-account balances with standing, and household member display names. View maths
// stays in engine/ (monthTotals, projectOccurrences, accountStanding, monthsForSwitcher,
// isOverdue) -- this module only maps cached rows into the shapes those functions expect and
// wires the results back into ActivityRowView/ProjectionView/AccountBalanceView.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AccountRow, TransactionRow } from '@/db/rows';
import { fetchTransactionsSearch, fetchTransferLegs, TRANSFER_LEGS_MAX } from '@/db/transactions';
import { fetchAccountBalances, fetchTransactionMonths, fetchHouseholdMemberNames, type AccountBalanceLegRow } from '@/db/recordReads';
import { accountBalance, isOverdue, monthTotals, monthsForSwitcher, type AccountBalance, type MonthTotals } from '@/engine/activity';
import { accountStanding, type Standing } from '@/engine/accounts';
import { projectOccurrences } from '@/engine/recurring';
import { minorUnits } from '@/engine/money';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';
import type { WithPending } from '../types';
import { useTransactionsForMonth } from './transactions';
import { useRecurringSeries } from './recurringSeries';
import { useFxLatest } from './fxLatest';
import { homeAmountFor, projectionHomeAmount } from './homeAmount';

export interface ActivityRowView extends WithPending<TransactionRow> {
  amountHome: number | null;
  overdue: boolean;
  /** D-50: set only for a transfer leg (row.transfer_id !== null); the other leg's account. */
  counterpartAccountId: string | null;
}

export interface ProjectionView {
  key: string;
  seriesId: string;
  date: string;
  name: string;
  amount: number;
  currency: string;
  categoryId: string | null;
  accountId: string;
  amountHome: number | null;
}

export interface MonthView {
  rows: ActivityRowView[];
  projections: ProjectionView[];
  totals: MonthTotals;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** D-50/D-51: both legs of one or more transfers, for the month view's counterpart lookup. */
export function useTransferLegs(householdId: string | null, transferIds: readonly string[]) {
  const idsKey = transferIds.join(',');
  const enabled = Boolean(householdId) && transferIds.length > 0;
  const query = useQuery({
    queryKey: queryKeys.transferLegs(householdId ?? '', idsKey),
    queryFn: () => fetchTransferLegs(supabase, householdId as string, transferIds),
    enabled,
  });
  return { legs: query.data ?? [], isLoading: enabled ? query.isLoading : false };
}

/** transfer_id -> the month's own rows sharing it (1 when the partner sits in another month, 2 when both legs are in this month). */
function groupByTransferId(rows: readonly WithPending<TransactionRow>[]): Map<string, WithPending<TransactionRow>[]> {
  const map = new Map<string, WithPending<TransactionRow>[]>();
  for (const row of rows) {
    if (row.transfer_id === null) continue;
    const list = map.get(row.transfer_id);
    if (list) list.push(row);
    else map.set(row.transfer_id, [row]);
  }
  return map;
}

/** transferId:rowId -> the other leg's account_id, resolved from same-month pairs and any fetched counterpart legs. */
function resolveCounterparts(
  transferGroups: ReadonlyMap<string, WithPending<TransactionRow>[]>,
  fetchedLegs: readonly TransactionRow[]
): Map<string, string> {
  const map = new Map<string, string>();

  for (const [transferId, legs] of transferGroups) {
    if (legs.length !== 2) continue;
    const [a, b] = legs as [WithPending<TransactionRow>, WithPending<TransactionRow>];
    map.set(`${transferId}:${a.id}`, b.account_id);
    map.set(`${transferId}:${b.id}`, a.account_id);
  }

  for (const leg of fetchedLegs) {
    if (leg.transfer_id === null) continue;
    const localLegs = transferGroups.get(leg.transfer_id);
    if (!localLegs || localLegs.length !== 1) continue;
    const localLeg = localLegs[0] as WithPending<TransactionRow>;
    if (leg.id === localLeg.id) continue; // the fetch's own copy of the local row, not its partner
    map.set(`${leg.transfer_id}:${localLeg.id}`, leg.account_id);
  }

  return map;
}

export function useMonthView(
  ctx: { householdId: string | null; homeCurrency: string; today: string },
  month: string
): MonthView {
  const { householdId, homeCurrency, today } = ctx;

  const txQuery = useTransactionsForMonth(householdId ?? undefined, month);
  const seriesQuery = useRecurringSeries(householdId ?? undefined);
  const fxQuery = useFxLatest();

  const rows = useMemo(() => txQuery.data ?? [], [txQuery.data]);
  const series = useMemo(() => seriesQuery.data ?? [], [seriesQuery.data]);
  const rates = useMemo(() => fxQuery.data ?? [], [fxQuery.data]);

  const transferGroups = useMemo(() => groupByTransferId(rows), [rows]);

  const missingTransferIds = useMemo(() => {
    const ids: string[] = [];
    for (const [transferId, legs] of transferGroups) {
      if (legs.length === 1) ids.push(transferId);
    }
    return ids.sort().slice(0, TRANSFER_LEGS_MAX);
  }, [transferGroups]);

  const { legs: fetchedLegs } = useTransferLegs(householdId, missingTransferIds);

  const counterparts = useMemo(() => resolveCounterparts(transferGroups, fetchedLegs), [transferGroups, fetchedLegs]);

  const mappedRows: ActivityRowView[] = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        amountHome: homeAmountFor(row, homeCurrency, rates),
        overdue: isOverdue(row, today),
        counterpartAccountId: row.transfer_id !== null ? (counterparts.get(`${row.transfer_id}:${row.id}`) ?? null) : null,
      })),
    [rows, homeCurrency, rates, today, counterparts]
  );

  const projections: ProjectionView[] = useMemo(() => {
    const result: ProjectionView[] = [];
    for (const s of series) {
      const dates = projectOccurrences(
        { anchorDate: s.anchor_date, freq: s.freq, endDate: s.end_date, occurrenceCount: s.occurrence_count },
        month,
        s.materialised_through
      );
      for (const date of dates) {
        result.push({
          key: `${s.id}:${date}`,
          seriesId: s.id,
          date,
          name: s.name,
          amount: s.amount,
          currency: s.currency,
          categoryId: s.category_id,
          accountId: s.account_id,
          amountHome: projectionHomeAmount(s.amount, s.currency, homeCurrency, rates),
        });
      }
    }
    return result;
  }, [series, month, homeCurrency, rates]);

  const totals = useMemo(
    () =>
      monthTotals(
        mappedRows.map((r) => ({ amountHome: r.amountHome, status: r.status, isTransfer: r.transfer_id !== null })),
        projections
      ),
    [mappedRows, projections]
  );

  return {
    rows: mappedRows,
    projections,
    totals,
    isLoading: txQuery.isLoading || seriesQuery.isLoading || fxQuery.isLoading,
    isError: txQuery.isError || seriesQuery.isError,
    refetch: () => {
      void txQuery.refetch();
      void seriesQuery.refetch();
    },
  };
}

/** ACT-02: every month with data, plus the current and next month, newest first. */
export function useTransactionMonths(householdId: string | null, today: string): { months: string[]; isLoading: boolean } {
  const query = useQuery({
    queryKey: queryKeys.transactionMonths(householdId ?? ''),
    queryFn: () => fetchTransactionMonths(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
  const dataMonths = useMemo(() => (query.data ?? []).map((m) => m.month), [query.data]);
  const months = useMemo(() => monthsForSwitcher(dataMonths, today), [dataMonths, today]);
  return { months, isLoading: query.isLoading };
}

/** ACT-03: a 2+ character term searches every month on the server. */
export const SEARCH_MIN_CHARS = 2;

export function useTransactionsSearch(
  householdId: string | null,
  term: string,
  homeCurrency: string,
  today: string
): { rows: ActivityRowView[]; isLoading: boolean; enabled: boolean } {
  const trimmed = term.trim();
  const enabled = Boolean(householdId) && trimmed.length >= SEARCH_MIN_CHARS;
  const fxQuery = useFxLatest();
  const rates = useMemo(() => fxQuery.data ?? [], [fxQuery.data]);

  const query = useQuery({
    queryKey: queryKeys.transactionsSearch(householdId ?? '', trimmed),
    queryFn: () => fetchTransactionsSearch(supabase, householdId as string, trimmed),
    enabled,
  });

  const rows: ActivityRowView[] = useMemo(
    () =>
      (query.data ?? []).map((row) => ({
        ...row,
        amountHome: homeAmountFor(row, homeCurrency, rates),
        overdue: isOverdue(row, today),
        counterpartAccountId: null,
      })),
    [query.data, homeCurrency, rates, today]
  );

  return { rows, isLoading: query.isLoading, enabled };
}

export interface AccountBalanceView extends AccountBalance {
  pendingSum: number | null;
  standing: Standing | null;
}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

/** BigInt-safe sum of a currency's own pending legs; null on overflow past Number.MAX_SAFE_INTEGER. */
function sumPending(values: readonly string[]): number | null {
  let sum = 0n;
  for (const v of values) sum += BigInt(v);
  if (sum > MAX_SAFE_BIGINT || sum < -MAX_SAFE_BIGINT) return null;
  return Number(sum);
}

function buildAccountBalanceView(account: AccountRow, legs: readonly AccountBalanceLegRow[]): AccountBalanceView {
  const balance = accountBalance({
    openingBalance: account.opening_balance,
    currency: account.currency,
    legs: legs.map((l) => ({ currency: l.currency, paidSum: l.paid_sum })),
  });

  const ownPending = legs.filter((l) => l.currency === account.currency).map((l) => l.pending_sum);
  const pendingSum = sumPending(ownPending);

  const standing =
    balance.balance !== null
      ? accountStanding({
          kind: account.kind,
          balance: minorUnits(balance.balance),
          overdraftLimit: account.overdraft_limit !== null ? minorUnits(account.overdraft_limit) : null,
          creditLimit: account.credit_limit !== null ? minorUnits(account.credit_limit) : null,
        })
      : null;

  return { ...balance, pendingSum, standing };
}

/** REC-08/REC-17/D-49/D-50: paid+pending sums and standing per account, built from that account's own legs only. */
export function useAccountBalances(
  householdId: string | null,
  accounts: readonly AccountRow[]
): { balances: Map<string, AccountBalanceView>; isLoading: boolean } {
  const query = useQuery({
    queryKey: queryKeys.accountBalances(householdId ?? ''),
    queryFn: () => fetchAccountBalances(supabase, householdId as string),
    enabled: Boolean(householdId),
  });

  const legsByAccount = useMemo(() => {
    const map = new Map<string, AccountBalanceLegRow[]>();
    for (const leg of query.data ?? []) {
      const list = map.get(leg.account_id);
      if (list) list.push(leg);
      else map.set(leg.account_id, [leg]);
    }
    return map;
  }, [query.data]);

  const balances = useMemo(() => {
    const result = new Map<string, AccountBalanceView>();
    for (const account of accounts) {
      result.set(account.id, buildAccountBalanceView(account, legsByAccount.get(account.id) ?? []));
    }
    return result;
  }, [accounts, legsByAccount]);

  return { balances, isLoading: query.isLoading };
}

/** Household member display names, for Activity/Accounts and undo-refusal copy; nulls omitted. */
export function useHouseholdMemberNames(householdId: string | null): Map<string, string> {
  const query = useQuery({
    queryKey: queryKeys.householdMembers(householdId ?? ''),
    queryFn: () => fetchHouseholdMemberNames(supabase, householdId as string),
    enabled: Boolean(householdId),
  });

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const row of query.data ?? []) {
      if (row.display_name !== null) map.set(row.user_id, row.display_name);
    }
    return map;
  }, [query.data]);
}
