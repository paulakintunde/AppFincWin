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
import { offerKey } from '@/engine/recurring/offer';
import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import { supabase } from '@/services/supabase';
import { queryKeys } from '@/data/keys';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideSettings } from '@/data/queries/decide';
import { useRecurringDismissals } from '@/data/queries/recurringDismissals';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useRecordContext } from '@/features/record/useRecordContext';
import { isNotPayKey, NOT_PAY_PREFIX, notPayKey, notPayMatcher } from './notPay';

const NO_ACCOUNTS: readonly AccountRow[] = [];
const NO_SERIES: readonly RecurringSeriesRow[] = [];
const NO_ROWS: readonly TransactionRow[] = [];
const NO_DISMISSALS: readonly RecurringDismissalRow[] = [];
const LOOKBACK_MONTHS = 6;

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
  /** The candidate key, for the "Not my pay" action. */
  readonly key: string;
}

export interface NotPayAnswer {
  readonly row: RecurringDismissalRow;
  readonly payer: string;
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
  /** Payers marked "Not my pay", for the clear row. */
  readonly notPay: readonly NotPayAnswer[];
}

export function useIncomeContext(): IncomeContext {
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const settings = useDecideSettings(userId);
  const accounts = useAccounts(householdId);
  const series = useRecurringSeries(householdId);
  const dismissals = useRecurringDismissals(householdId);

  const month = rc.today.slice(0, 7);
  const from = monthRange(monthMinus(month, LOOKBACK_MONTHS - 1)).start;
  const history = useQuery({
    queryKey: queryKeys.offerHistory(householdId ?? '', from, rc.today),
    queryFn: () => fetchTransactionsInRange(supabase, householdId as string, { from, toInclusive: rc.today }),
    enabled: Boolean(householdId),
  });
  const rows = history.data ?? NO_ROWS;
  const dismissalRows = dismissals.data ?? NO_DISMISSALS;

  const found = useMemo((): FoundPayer | null => {
    const detect: DetectRow[] = [];
    for (const r of rows) {
      // Plain money in only: mirrors isIncomeRow (D-03) -- a refund or refund-linked row is never pay (F-02).
      if (r.is_refund === true || (r.refund_of ?? null) !== null || r.original_amount <= 0) continue;
      if (r.is_sample || r.transfer_id !== null || r.status === 'skipped' || r.recurring_series_id !== null || !r.name) continue;
      detect.push({ id: r.id, name: r.name, amount: r.original_amount, currency: r.original_currency, date: r.local_date, isTransfer: false, accountId: r.account_id });
    }
    const isNotPay = notPayMatcher(dismissalRows);
    const incoming = detectCandidates(detect, { dismissedKeys: new Set(), linkedRowIds: new Set() }).filter((c) => c.direction === 'in' && !isNotPay(c.key));
    const best = incoming[0];
    if (best === undefined) return null;
    const currency = detect.find((d) => best.rowIds.includes(d.id))?.currency ?? rc.homeCurrency;
    return { payer: best.name, amount: Number(best.amount), day: Number(best.anchorDate.slice(8, 10)), currency, key: best.key };
  }, [rows, dismissalRows, rc.homeCurrency]);

  const notPay = useMemo((): readonly NotPayAnswer[] => {
    const out: NotPayAnswer[] = [];
    for (const row of dismissalRows) {
      if (row.deleted_at !== null || row.direction !== 'in' || !isNotPayKey(row.payee_key)) continue;
      let payer = '';
      for (const r of rows) {
        if (r.name && notPayKey(offerKey(r.name, r.original_currency, r.original_amount)) === row.payee_key) payer = r.name;
      }
      out.push({ row, payer: payer === '' ? row.payee_key.slice(NOT_PAY_PREFIX.length).split('|')[0] ?? '' : payer });
    }
    return out;
  }, [dismissalRows, rows]);

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
    notPay,
  };
}
