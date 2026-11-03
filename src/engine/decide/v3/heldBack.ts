/**
 * Yearly and every-3-month bills (05.4 FIN-11 as changed by D-47). Pure; integer minor units, bigint inside.
 *
 * - The built-up share is the part of the bill the months since it was last paid have built up:
 *   bill x whole months since last paid / months between payments (half up), never more than the bill. It is 0 again the
 *   day after each payment.
 * - D-47: only the part the months before the due date cannot cover from the usual monthly leftover is held back:
 *   holdBack = min(builtUp, max(0, bill - usualLeftover x whole months until due)). Someone with a thin leftover still gets
 *   the whole built-up share held back.
 * - Last paid: the newest paid line of the bill on or before asOf, or the newest due date on or before asOf, whichever is
 *   later. A bill with neither builds up from its first due date (the anchor), so nothing has built up before it.
 * - A bill due this month is already in this month's bills (the month model and the suggested unspent figure), so it is
 *   not held back a second time; it still names its due date.
 */
import type { MinorUnits } from '../../money/types';
import { divideHalfUp } from '../../money/rounding';
import { minorFromBigInt } from '../../payoff/types';
import { addMonthsClamped, cadenceDate, yearMonthOf } from './dates';
import { liveSeriesOf } from './month/series';
import type { BillHeldBack, BillsHeldBack, LocalDate, V3Line, V3Series } from './types';

const FN = 'heldBackForBills';

/** The cadences D-47 covers: every 3 months and every 12 months. */
const LONG_EVERY: readonly number[] = [3, 12];


/** Whole months from `from` to `to` (the largest n with from + n months on or before to); 0 when to is before from. */
export function wholeMonthsBetween(from: LocalDate, to: LocalDate): number {
  if (to <= from) return 0;
  const a = from.split('-').map(Number) as [number, number, number];
  const b = to.split('-').map(Number) as [number, number, number];
  const rough = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  return addMonthsClamped(from, rough) <= to ? rough : rough - 1;
}

/** The newest due date on or before asOf, or null when the first one is still to come. */
function lastDueOnOrBefore(s: V3Series, asOf: LocalDate): LocalDate | null {
  let last: LocalDate | null = null;
  for (let n = 0; ; n++) {
    const d = cadenceDate(s.anchorDate, s.cadence, n);
    if (d > asOf) return last;
    last = d;
  }
}

/** The first due date after a payment on `paid`: the first one more than half a period after it. */
function dueAfter(s: V3Series, paid: LocalDate): LocalDate {
  const past = addMonthsClamped(paid, Math.floor(s.cadence.every / 2));
  for (let n = 0; ; n++) {
    const d = cadenceDate(s.anchorDate, s.cadence, n);
    if (d > past) return d;
  }
}

/**
 * The hold-back for each yearly or every-3-month bill. `lines` are the recorded lines (any month); `usualLeftover` is what the
 * usual month leaves before the purchase (null or below 0 counts as 0); `skip` holds bills someone else always pays (D-31).
 */
export function heldBackForBills(
  series: readonly V3Series[],
  lines: readonly V3Line[],
  asOf: LocalDate,
  usualLeftover: MinorUnits | null,
  skip: ReadonlySet<string> = new Set()
): BillsHeldBack {
  const leftover = BigInt(usualLeftover !== null && usualLeftover > 0 ? usualLeftover : 0);
  const thisMonth = yearMonthOf(asOf);
  const parts: BillHeldBack[] = [];
  let total = 0n;
  const bills = liveSeriesOf(series, asOf, 'bill')
    .filter((s) => s.cadence.unit === 'month' && LONG_EVERY.includes(s.cadence.every) && s.amount > 0 && !skip.has(s.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const s of bills) {
    const paidLine = lines
      .filter((l) => l.seriesId === s.id && l.status === 'paid' && l.date <= asOf)
      .reduce<LocalDate | null>((t, l) => (t === null || l.date > t ? l.date : t), null);
    const lastDue = lastDueOnOrBefore(s, asOf);
    const paid = paidLine !== null && (lastDue === null || paidLine > lastDue) ? paidLine : lastDue;
    const dueDate = paid === null ? s.anchorDate : dueAfter(s, paid);
    if (s.endDate !== null && dueDate > s.endDate) continue;
    const bill = BigInt(s.amount);
    const every = BigInt(s.cadence.every);
    const since = BigInt(paid === null ? 0 : wholeMonthsBetween(paid, asOf));
    const share = divideHalfUp(bill * since, every);
    const builtUp = share < bill ? share : bill;
    // D-47: what the whole months before the due date cannot cover from the usual leftover, capped at the built-up share.
    const uncovered = bill - leftover * BigInt(wholeMonthsBetween(asOf, dueDate));
    let holdBack = uncovered > 0n ? uncovered : 0n;
    if (holdBack > builtUp) holdBack = builtUp;
    if (yearMonthOf(dueDate) === thisMonth) holdBack = 0n; // already in this month's bills
    total += holdBack;
    parts.push({ seriesId: s.id, amount: s.amount, builtUp: minorFromBigInt(builtUp, FN), holdBack: minorFromBigInt(holdBack, FN), dueDate });
  }
  return { total: minorFromBigInt(total, FN), parts };
}
