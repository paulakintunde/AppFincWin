/**
 * Confirmed regular payments in the v3 month (05.1 S1; I34, D-02, D-03, D-19, D-21, D-25). Pure: no clock.
 * Never imports recurring/detect: a series reaches here only after the user confirmed it.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { addYearMonths, cadenceDatesBetween, yearMonthOf } from '../dates';
import { SERIES_DRIFT_DIVISOR, SERIES_DRIFT_LAST } from '../constants';
import type { Cadence, SeriesRole, V3Line, V3Month, V3Series, YearMonth } from '../types';

export type LineClass =
  | 'recurring_bill'
  | 'recurring_income'
  | 'other_income_unconfirmed'
  | 'everyday'
  | 'refund'
  | 'debt_payment'
  | 'saving'
  | 'saving_withdrawal'
  | 'investing'
  | 'other_in'
  | 'other_out'
  | 'ignored';

export function seriesIndex(series: readonly V3Series[]): ReadonlyMap<string, V3Series> {
  const map = new Map<string, V3Series>();
  for (const s of series) map.set(s.id, s);
  return map;
}

/** Confirmed, not dismissed, and not past its end date on `onDate` (D-21, D-25, I34). */
export function isCounting(s: V3Series, onDate: string): boolean {
  return s.confirmed && s.status !== 'dismissed' && (s.endDate === null || onDate <= s.endDate);
}

export function classifyLine(line: V3Line, index: ReadonlyMap<string, V3Series>): LineClass {
  switch (line.role) {
    case 'own_transfer':
    case 'emergency_move':
      return 'ignored';
    case 'envelope_deposit':
      return 'saving';
    case 'envelope_withdrawal':
      return 'saving_withdrawal';
    case 'refund':
      return 'refund';
    case 'other_in':
      return 'other_in';
    case 'other_out':
      return 'other_out';
    case 'debt_payment':
      return 'debt_payment';
    default:
      break;
  }
  const s = line.seriesId === null ? undefined : index.get(line.seriesId);
  const counting = s !== undefined && isCounting(s, line.date);
  switch (line.role) {
    case 'saved_invested':
      return s !== undefined && s.role === 'investing' ? 'investing' : 'saving';
    case 'income':
      return counting && (s.role === 'pay' || s.role === 'other_income') ? 'recurring_income' : 'other_income_unconfirmed';
    default: {
      // 'spending'
      if (!counting) return 'everyday';
      if (s.role === 'bill') return 'recurring_bill';
      if (s.role === 'debt_payment') return 'debt_payment';
      if (s.role === 'saving') return 'saving';
      if (s.role === 'investing') return 'investing';
      return 'everyday';
    }
  }
}

/** Dates of a series in [fromInclusive, toExclusive); none for unconfirmed or dismissed; capped at endDate. */
export function seriesOccurrences(s: V3Series, fromInclusive: string, toExclusive: string): readonly string[] {
  if (!s.confirmed || s.status === 'dismissed') return [];
  return cadenceDatesBetween(s.anchorDate, s.cadence, fromInclusive, toExclusive, s.endDate);
}

/** Series of one role that still run on asOf. */
export function liveSeriesOf(series: readonly V3Series[], asOf: string, role: SeriesRole): readonly V3Series[] {
  return series.filter((s) => s.role === role && isCounting(s, asOf));
}

/** Payments a year as a fraction num/den: week 52/every, month 12/every. */
export function paymentsPerYear(c: Cadence): { readonly num: number; readonly den: number } {
  return { num: c.unit === 'week' ? 52 : 12, den: c.every };
}

export interface SeriesDrift {
  readonly seriesId: string;
  readonly current: MinorUnits;
  readonly suggested: MinorUnits;
  readonly fromMonth: YearMonth;
}

/** UP 4.2: the last SERIES_DRIFT_LAST paid lines all differ from the series amount by more than 5%. Suggestion only. */
export function seriesDrift(series: readonly V3Series[], months: readonly V3Month[]): readonly SeriesDrift[] {
  const paid = new Map<string, V3Line[]>();
  for (const m of months) {
    for (const l of m.lines) {
      if (l.status !== 'paid' || l.seriesId === null) continue;
      const list = paid.get(l.seriesId);
      if (list === undefined) paid.set(l.seriesId, [l]);
      else list.push(l);
    }
  }
  const out: SeriesDrift[] = [];
  for (const s of series) {
    if (!s.confirmed || s.status === 'dismissed') continue;
    const lines = (paid.get(s.id) ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    if (lines.length < SERIES_DRIFT_LAST) continue;
    const last = lines.slice(-SERIES_DRIFT_LAST);
    const baseAbs = BigInt(Math.abs(s.amount));
    const drifted = last.every((l) => {
      if (Math.sign(l.amount) !== Math.sign(s.amount)) return false;
      return BigInt(Math.abs(l.amount - s.amount)) * BigInt(SERIES_DRIFT_DIVISOR) > baseAbs;
    });
    if (!drifted) continue;
    const latest = last[last.length - 1] as V3Line;
    out.push({
      seriesId: s.id,
      current: s.amount,
      suggested: minorUnits(latest.amount),
      fromMonth: addYearMonths(yearMonthOf(latest.date), 1),
    });
  }
  return out.sort((a, b) => (a.seriesId < b.seriesId ? -1 : 1));
}
