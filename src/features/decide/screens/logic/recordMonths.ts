/**
 * 06.1-79 (H-16, DS-10, OQ-79-2 A): one months-of-records count everywhere, the one the answer uses. The answer's basis line
 * ("Based on 1 of the 3 months of records") reads the engine's confidence basis: the months complete enough to judge a usual month
 * (the month model's `monthsUsed`). Decide home and the Records setup item used to count every month marked full in the inputs
 * ("3 of 3 months"), so a month the engine left out (under-logged, or outside the window) counted on home and not in the answer.
 * Now home, the Records item and the "How this was worked out" note read this helper over the same evaluation. Pure: no React,
 * no I/O; the engine's result is read, never recomputed.
 */
import { CONFIDENCE_MIN_MONTHS, type Basis, type V3Inputs } from '@/engine/decide/v3';

export interface RecordMonths {
  /** Months complete enough to use: the count in the answer's basis line. */
  readonly used: number;
  /** The months Decide looks for (3), or more when more are used. */
  readonly total: number;
  /** Spending entries in the months used. */
  readonly entries: number;
}

/**
 * The parts of an evaluation this reads: the answer's basis and the month model's months used. Both are optional so a partly read
 * evaluation (a cache shape, a test double) reads as not judged yet rather than as a count.
 */
export interface RecordMonthsSource {
  readonly result: { readonly confidence?: { readonly basis: Basis } };
  readonly month?: { readonly monthsUsed: readonly string[] };
}

const NOTHING_USED: RecordMonths = { used: 0, total: CONFIDENCE_MIN_MONTHS, entries: 0 };

export function recordMonthsOf(inputs: V3Inputs | null, evaluation: RecordMonthsSource | null): RecordMonths {
  const basis = evaluation?.result.confidence?.basis;
  const usedMonths = evaluation?.month?.monthsUsed;
  if (basis === undefined || usedMonths === undefined) return NOTHING_USED;
  // Quick estimates say no month count of their own; the month model still names the months it used.
  const used = basis.kind === 'partial' ? basis.used : basis.kind === 'quick_estimates' ? usedMonths.length : basis.months;
  const total = basis.kind === 'partial' ? basis.lookedFor : Math.max(CONFIDENCE_MIN_MONTHS, used);
  const months = new Set(usedMonths);
  const entries = (inputs?.months ?? []).filter((m) => months.has(m.month)).reduce((n, m) => n + m.lines.filter((l) => l.role === 'spending').length, 0);
  return { used, total, entries };
}
