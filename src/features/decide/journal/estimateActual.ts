// 05-08: D-12 estimate-vs-actual. PURE. Numbers only, no new data entry.
// Integer minor units; the monthly average is rounded half-up with bigint (no float division).
import { daysInMonth } from '@/engine/recurring/schedule';

export interface LinkedLine {
  id: string;
  date: string;
  amount: number | null; // home minor units, sign ignored
  status: 'pending' | 'paid' | 'skipped';
  seriesId: string | null;
}
export interface EstimateInput {
  decidedDate: string;
  estimateDayOne: number;
  estimateMonthly: number;
  lines: readonly LinkedLine[];
}
export type Tone = 'over' | 'at' | 'under';
/**
 * WR-B06: an actual (and its diff and tone) is null before the checkpoint, when no paid line of its kind falls in the
 * window, or when one of them has no stored rate: a figure with no linked line is null, never zero (04 D-56, D-39).
 */
export interface Checkpoint {
  days: 30 | 90;
  date: string;
  reached: boolean;
  dayOneActual: number | null;
  monthlyActual: number | null;
  diffDayOne: number | null;
  diffMonthly: number | null;
  toneDayOne: Tone | null;
  toneMonthly: Tone | null;
}

function addDays(date: string, days: number): string {
  let [y, m, d] = date.split('-').map((p) => parseInt(p, 10)) as [number, number, number];
  d += days;
  while (d > daysInMonth(y, m)) {
    d -= daysInMonth(y, m);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const toneOf = (diff: number): Tone => (diff > 0 ? 'over' : diff < 0 ? 'under' : 'at');

function halfUpDivide(total: number, divisor: number): number {
  const t = BigInt(total);
  const v = BigInt(divisor);
  return Number((t * BigInt(2) + v) / (BigInt(2) * v));
}

function checkpoint(input: EstimateInput, days: 30 | 90, today: string): Checkpoint {
  const date = addDays(input.decidedDate, days);
  const reached = today >= date;
  const dayOne = { total: 0, count: 0, missing: false };
  const series = { total: 0, count: 0, missing: false };
  if (reached) {
    for (const line of input.lines) {
      if (line.status !== 'paid') continue;
      if (line.date < input.decidedDate || line.date > date) continue;
      if (line.seriesId !== null && line.date <= input.decidedDate) continue;
      const kind = line.seriesId === null ? dayOne : series;
      if (line.amount === null) kind.missing = true;
      else {
        kind.total += Math.abs(line.amount);
        kind.count += 1;
      }
    }
  }
  const known = (k: typeof dayOne) => k.count > 0 && !k.missing;
  const dayOneActual = known(dayOne) ? dayOne.total : null;
  const monthlyActual = known(series) ? halfUpDivide(series.total, days / 30) : null;
  const diffDayOne = dayOneActual === null ? null : dayOneActual - input.estimateDayOne;
  const diffMonthly = monthlyActual === null ? null : monthlyActual - input.estimateMonthly;
  return {
    days,
    date,
    reached,
    dayOneActual,
    monthlyActual,
    diffDayOne,
    diffMonthly,
    toneDayOne: diffDayOne === null ? null : toneOf(diffDayOne),
    toneMonthly: diffMonthly === null ? null : toneOf(diffMonthly),
  };
}

export function compareEstimate(
  input: EstimateInput,
  today: string
): { checkpoints: readonly [Checkpoint, Checkpoint]; skipped: number } {
  const end = addDays(input.decidedDate, 90);
  const skipped = input.lines.filter(
    (l) => l.status === 'paid' && l.amount === null && l.date >= input.decidedDate && l.date <= end
  ).length;
  return { checkpoints: [checkpoint(input, 30, today), checkpoint(input, 90, today)], skipped };
}

export function scheduleMatch(
  lines: readonly LinkedLine[],
  today: string
): { paid: number; due: number } {
  const due = lines.filter((l) => l.date <= today);
  return { paid: due.filter((l) => l.status === 'paid').length, due: due.length };
}
