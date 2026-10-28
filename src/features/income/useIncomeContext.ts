/**
 * Plan 05.2-22: the reads every income step shares -- who is signed in, the settings row, the household's live
 * accounts and series -- and the prefill from the records (a found regular payer). Reads only; the steps own the writes.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AccountRow, RecurringSeriesRow, TransactionRow } from '@/db/rows';
import { fetchTransactionsInRange } from '@/db/transactions';
import { detectCandidates, type DetectRow } from '@/engine/decide/v3';
import { monthRange } from '@/engine/time';
import { supabase } from '@/services/supabase';
import { queryKeys } from '@/data/keys';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideSettings } from '@/data/queries/decide';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useRecordContext } from '@/features/record/useRecordContext';

const NO_ACCOUNTS: readonly AccountRow[] = [];
const NO_SERIES: readonly RecurringSeriesRow[] = [];
const NO_ROWS: readonly TransactionRow[] = [];
const LOOKBACK_MONTHS = 6;

/** Accounts that can receive pay: live, not archived, and not a card or loan. */
export function payableAccounts(accounts: readonly AccountRow[]): AccountRow[] {
  return accounts.filter((a) => a.deleted_at === null && a.archived_at === null && a.kind !== 'credit' && a.kind !== 'loan');
}

/** A live income series carrying this income kind. */
export function seriesOfKind(series: readonly RecurringSeriesRow[], kind: string): RecurringSeriesRow[] {
  return series.filter((s) => s.deleted_at === null && s.income_kind === kind && s.amount > 0);
}

function monthMinus(month: string, back: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) - back;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export interface FoundPayer {
  readonly payer: string;
  readonly amount: number;
  readonly day: number;
  readonly currency: string;
}

export interface IncomeContext {
  readonly userId: string | undefined;
  readonly householdId: string | undefined;
  readonly homeCurrency: string;
  readonly timeZone: string;
  readonly today: string;
  readonly settings: ReturnType<typeof useDecideSettings>['data'];
  readonly accounts: readonly AccountRow[];
  readonly series: readonly RecurringSeriesRow[];
  readonly found: FoundPayer | null;
}

export function useIncomeContext(): IncomeContext {
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const settings = useDecideSettings(userId);
  const accounts = useAccounts(householdId);
  const series = useRecurringSeries(householdId);

  const month = rc.today.slice(0, 7);
  const from = monthRange(monthMinus(month, LOOKBACK_MONTHS - 1)).start;
  const history = useQuery({
    queryKey: queryKeys.offerHistory(householdId ?? '', from, rc.today),
    queryFn: () => fetchTransactionsInRange(supabase, householdId as string, { from, toInclusive: rc.today }),
    enabled: Boolean(householdId),
  });
  const rows = history.data ?? NO_ROWS;

  const found = useMemo((): FoundPayer | null => {
    const detect: DetectRow[] = [];
    for (const r of rows) {
      if (r.is_sample || r.transfer_id !== null || r.status === 'skipped' || r.recurring_series_id !== null || !r.name) continue;
      detect.push({ id: r.id, name: r.name, amount: r.original_amount, currency: r.original_currency, date: r.local_date, isTransfer: false, accountId: r.account_id });
    }
    const incoming = detectCandidates(detect, { dismissedKeys: new Set(), linkedRowIds: new Set() }).filter((c) => c.direction === 'in');
    const best = incoming[0];
    if (best === undefined) return null;
    const currency = detect.find((d) => best.rowIds.includes(d.id))?.currency ?? rc.homeCurrency;
    return { payer: best.name, amount: Number(best.amount), day: Number(best.anchorDate.slice(8, 10)), currency };
  }, [rows, rc.homeCurrency]);

  return {
    userId,
    householdId,
    homeCurrency: rc.homeCurrency,
    timeZone: rc.timeZone,
    today: rc.today,
    settings: settings.data,
    accounts: accounts.data ?? NO_ACCOUNTS,
    series: series.data ?? NO_SERIES,
    found,
  };
}
