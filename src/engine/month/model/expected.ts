/**
 * 08.1-09 (D-09, T-08.1-21): expected lines. A varying running cost (fuel, repairs) is recorded as a bill series of kind 'expected':
 * a guess at the month, not a payment. In the month it falls due it counts max(0, expected - real spending in its category this
 * month), so the guess and the real spending are never both counted in full. Pure: no clock, no I/O, integer minor units.
 *
 * Only this month's occurrences are reduced (the spending is this month's); later months count the whole expected amount. A line
 * with no category cannot be matched to spending and counts whole. Spending is the paid 'spending' lines of the month that belong to
 * no series; one category's pool is shared by its expected dues in date then id order, so the same spending is never used twice.
 * The month figure (thisMonth) and the open cash path (cash/path) both read this one map, so they always agree.
 */
import { addYearMonths, yearMonthOf } from '../../decide/v3/dates';
import type { V3Line, V3Series } from '../../decide/v3/types';
import { linePartAmounts } from '../../parts/lineParts';
import { liveSeriesOf, seriesOccurrences } from './series';

/** max(0, expected - actual). */
export function expectedCount(expected: bigint, actual: bigint): bigint {
  return actual >= expected ? 0n : expected - actual;
}

export interface ExpectedDueInput {
  readonly asOf: string;
  readonly series: readonly V3Series[];
  /** The lines of the month asOf falls in (other months' lines are ignored here). */
  readonly lines: readonly V3Line[];
}

/** "seriesId|dueDate" -> the amount (positive) that due counts, for this month's dues of expected bill series only. */
export function expectedDueCounts(input: ExpectedDueInput): ReadonlyMap<string, bigint> {
  const out = new Map<string, bigint>();
  const month = yearMonthOf(input.asOf);
  const monthStart = `${month}-01`;
  const nextFirst = `${addYearMonths(month, 1)}-01`;

  const dues: { readonly key: string; readonly date: string; readonly id: string; readonly category: string; readonly amount: bigint }[] = [];
  for (const s of liveSeriesOf(input.series, input.asOf, 'bill')) {
    if (s.amountKind !== 'expected') continue;
    for (const date of seriesOccurrences(s, monthStart, nextFirst, input.asOf)) {
      const amount = BigInt(Math.abs(s.amount));
      if (s.categoryId === null) continue; // no category: counts whole
      dues.push({ key: `${s.id}|${date}`, date, id: s.id, category: s.categoryId, amount });
    }
  }
  if (dues.length === 0) return out;

  const pool = new Map<string, bigint>();
  for (const l of input.lines) {
    if (l.status !== 'paid' || l.role !== 'spending' || l.seriesId !== null) continue;
    if (yearMonthOf(l.date) !== month) continue;
    for (const p of linePartAmounts(l)) {
      if (p.categoryId === null) continue;
      pool.set(p.categoryId, (pool.get(p.categoryId) ?? 0n) + BigInt(Math.abs(p.amount)));
    }
  }

  dues.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1));
  for (const d of dues) {
    const spent = pool.get(d.category) ?? 0n;
    out.set(d.key, expectedCount(d.amount, spent));
    pool.set(d.category, spent > d.amount ? spent - d.amount : 0n);
  }
  return out;
}
