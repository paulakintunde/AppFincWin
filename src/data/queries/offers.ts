// Series offers from logged history (CONTEXT D-09, D-17, D-18). detectRecurring runs on the
// device (detect.ts unchanged, D-17) over the last OFFER_LOOKBACK_MONTHS months. Sample rows
// (D-09), transfers, skipped rows and rows already linked to a series never enter detection.
// Offers are those whose latest row is in the viewed month and whose key is not dismissed.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TransactionRow } from '@/db/rows';
import { fetchTransactionsInRange } from '@/db/transactions';
import { detectRecurring, selectOffers, type RecurringDetectRow, type SeriesOffer } from '@/engine/recurring';
import { monthRange } from '@/engine/time';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';
import { useDismissedOffers } from './recordPrefs';

/** Discretionary lookback (RESEARCH assumption A2): six months of history feed detection. */
export const OFFER_LOOKBACK_MONTHS = 6;

function monthMinus(month: string, back: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) - back;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

const NO_ROWS: TransactionRow[] = [];

export function useSeriesOffers(
  ctx: { householdId: string | null; userId: string | null },
  month: string
): { offers: SeriesOffer[]; rowsById: ReadonlyMap<string, TransactionRow>; isLoading: boolean } {
  const from = monthRange(monthMinus(month, OFFER_LOOKBACK_MONTHS - 1)).start;
  const to = lastDayOf(month);
  const query = useQuery({
    queryKey: queryKeys.offerHistory(ctx.householdId ?? '', from, to),
    queryFn: () => fetchTransactionsInRange(supabase, ctx.householdId as string, { from, toInclusive: to }),
    enabled: Boolean(ctx.householdId),
  });
  const { keys: dismissedKeys } = useDismissedOffers(ctx.userId ?? undefined);
  const rows = query.data ?? NO_ROWS;

  const detected = useMemo(() => {
    const eligible: RecurringDetectRow[] = [];
    for (const r of rows) {
      if (r.is_sample || r.transfer_id !== null || r.status === 'skipped' || r.recurring_series_id !== null || !r.name) {
        continue;
      }
      eligible.push({ id: r.id, name: r.name, amount: r.original_amount, currency: r.original_currency, localDate: r.local_date });
    }
    return detectRecurring(eligible);
  }, [rows]);

  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r] as const)), [rows]);

  const offers = useMemo(() => {
    const seriesLinkedRowIds = new Set(rows.filter((r) => r.recurring_series_id !== null).map((r) => r.id));
    const rowDates = new Map(rows.map((r) => [r.id, r.local_date] as const));
    return selectOffers(detected, { viewedMonth: month, dismissedKeys, seriesLinkedRowIds, rowDates });
  }, [detected, rows, month, dismissedKeys]);

  return { offers, rowsById, isLoading: query.isLoading };
}
