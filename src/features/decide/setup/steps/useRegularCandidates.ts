/**
 * Plan 05.2-24: the found regular payments the Regular payments step lists. Candidates are computed on the device from
 * the last six months of records and are never stored (T-05.2-24-01). Only a live series counts as regular (I34); a
 * dismissal row means "Not regular"; a candidate with neither is unmarked and is not counted.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { detectCandidates, type DetectRow, type RecurringCandidate } from '@/engine/decide/v3';
import { monthRange } from '@/engine/time';
import { offerKey } from '@/engine/recurring/offer';
import type { RecurringSeriesRow, TransactionRow } from '@/db/rows';
import type { RecurringDismissalRow } from '@/db/recurringDismissals';
import type { RecurringFreq } from '@/engine/recurring';
import { fetchTransactionsInRange } from '@/db/transactions';
import { supabase } from '@/services/supabase';
import { queryKeys } from '@/data/keys';
import { useRecurringSeries } from '@/data/queries/recurringSeries';
import { useRecurringDismissals } from '@/data/queries/recurringDismissals';
import { useRecordContext } from '@/features/record/useRecordContext';

const LOOKBACK_MONTHS = 6;
const NO_ROWS: readonly TransactionRow[] = [];
const NO_SERIES: readonly RecurringSeriesRow[] = [];
const NO_DISMISSALS: readonly RecurringDismissalRow[] = [];

export type CandidateState = 'unmarked' | 'regular' | 'notRegular';

export interface CandidateRow {
  readonly id: string;
  readonly candidate: RecurringCandidate;
  readonly state: CandidateState;
  readonly currency: string;
  readonly accountId: string | null;
  readonly categoryId: string | null;
  readonly series: RecurringSeriesRow | null;
  readonly dismissal: RecurringDismissalRow | null;
  readonly freq: RecurringFreq;
}

function monthMinus(month: string, back: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) - back;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** The series frequency a detected cadence maps to. */
export function freqOfCadence(c: RecurringCandidate['cadence']): RecurringFreq {
  if (c.unit === 'week') return c.every === 2 ? 'fortnightly' : 'weekly';
  if (c.every === 12) return 'yearly';
  if (c.every === 3) return 'quarterly';
  return 'monthly';
}

const dayOf = (date: string): number => Number(date.slice(8, 10));
const nameKey = (name: string, currency: string): string => offerKey(name, currency, 1).split('|').slice(0, 2).join('|');

export function useRegularCandidates(): { rows: readonly CandidateRow[]; isLoading: boolean; householdId: string | undefined; userId: string | undefined; today: string; homeCurrency: string; timeZone: string } {
  const rc = useRecordContext();
  const householdId = rc.householdId ?? undefined;
  const userId = rc.userId ?? undefined;
  const series = useRecurringSeries(householdId);
  const dismissals = useRecurringDismissals(householdId);
  const from = monthRange(monthMinus(rc.today.slice(0, 7), LOOKBACK_MONTHS - 1)).start;
  const history = useQuery({
    queryKey: queryKeys.offerHistory(householdId ?? '', from, rc.today),
    queryFn: () => fetchTransactionsInRange(supabase, householdId as string, { from, toInclusive: rc.today }),
    enabled: Boolean(householdId),
  });
  const txns = history.data ?? NO_ROWS;
  const liveSeries = series.data ?? NO_SERIES;
  const live = dismissals.data ?? NO_DISMISSALS;

  const rows = useMemo((): readonly CandidateRow[] => {
    const detect: DetectRow[] = [];
    const byId = new Map<string, TransactionRow>();
    for (const r of txns) {
      if (r.is_sample || r.transfer_id !== null || r.status === 'skipped' || !r.name) continue;
      byId.set(r.id, r);
      // Rows that belong to a series already are left out, so a confirmed series stops being offered once it has history.
      if (r.recurring_series_id !== null) continue;
      detect.push({ id: r.id, name: r.name, amount: r.original_amount, currency: r.original_currency, date: r.local_date, isTransfer: false, accountId: r.account_id });
    }
    const found = detectCandidates(detect, { dismissedKeys: new Set(), linkedRowIds: new Set() });
    return found.map((candidate): CandidateRow => {
      const last = byId.get(candidate.rowIds[candidate.rowIds.length - 1] as string);
      const currency = last?.original_currency ?? rc.homeCurrency;
      const wanted = nameKey(candidate.name, currency);
      const confirmed =
        liveSeries.find(
          (s) =>
            s.deleted_at === null &&
            nameKey(s.name, s.currency) === wanted &&
            (candidate.payGroupKey === null || dayOf(s.anchor_date) === dayOf(candidate.anchorDate))
        ) ?? null;
      const dismissal = live.find((d) => d.payee_key === candidate.key && d.direction === candidate.direction) ?? null;
      const state: CandidateState = confirmed !== null ? 'regular' : dismissal !== null ? 'notRegular' : 'unmarked';
      return {
        id: `${candidate.key}|${candidate.anchorDate}`,
        candidate,
        state,
        currency,
        accountId: last?.account_id ?? null,
        categoryId: last?.category_id ?? null,
        series: confirmed,
        dismissal,
        freq: freqOfCadence(candidate.cadence),
      };
    });
  }, [txns, liveSeries, live, rc.homeCurrency]);

  return {
    rows,
    isLoading: history.isLoading,
    householdId,
    userId,
    today: rc.today,
    homeCurrency: rc.homeCurrency,
    timeZone: rc.timeZone,
  };
}
