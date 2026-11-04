/**
 * 05.4 BO-05 (05.4-26, Variant C, VC-02): an item's running costs. Pure; integer minor units; no clock (every date is an input).
 *
 * - runningCostOutflows: each line's own due dates from its start date, every 1, 3 or 12 months (the day clamped to short months and
 *   worked out from the start each time), up to its end date (inclusive) and inside the path [from, from + days). A cost is counted
 *   only from its start date (I69; RC-03: insurance from 1 February falls once on a path to 13 February). A line switched off (FIN-28,
 *   RC-09) or with no positive amount is never counted.
 * - monthlyShare: what the lines take from a usual month: amount / every months, rounded half up, per line (RC-04: $600 a year is $50
 *   a month; RC-01: $150 + $120 + $30 + $23 = $323). A line that has not started yet still counts (a usual month once the costs start,
 *   RC-03); a line whose end date falls before `month` does not (RC-05: the winter pass counts while it runs).
 *
 * Amounts are the full line amounts; the buyer's share is applied by the caller (judge/purchase.ts), once.
 */
import { divideHalfUp } from '../../../money/rounding';
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import type { DatedFlow } from '../cash/path';
import { addDays, addMonthsClamped, isValidLocalDate, parseDate } from '../dates';
import type { LocalDate, RunningCostLine, YearMonth } from '../types';

const FN = 'runningCosts';
const EVERY: ReadonlySet<number> = new Set([1, 3, 12]);

/** A line that counts: switched on, a positive safe amount and a known cadence. */
export function countsAsRunning(line: RunningCostLine): boolean {
  return line.on && Number.isSafeInteger(line.amount) && line.amount > 0 && EVERY.has(line.everyMonths);
}

/** The line's last day, or null for no end. An end that is not a real date is read as no end (never fewer costs). */
function endOf(line: RunningCostLine): LocalDate | null {
  return line.end !== null && isValidLocalDate(line.end) ? line.end : null;
}

function monthNumber(date: LocalDate): number {
  const { y, m } = parseDate(date);
  return y * 12 + m - 1;
}

function byDateThenId(a: { readonly date: string; readonly id: string }, b: { readonly date: string; readonly id: string }): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Every due date of the lines inside [from, from + days), each as one outflow of the line's full amount, sorted by date then id.
 * A start date that is not a real date is read as `from` (counted from today: never fewer costs).
 */
export function runningCostOutflows(lines: readonly RunningCostLine[], from: LocalDate, days: number): DatedFlow[] {
  if (!Number.isInteger(days) || days < 1) throw new RangeError(`${FN}: days must be a positive integer`);
  const stopAt = addDays(from, days);
  const out: { readonly date: LocalDate; readonly id: string; readonly amount: MinorUnits }[] = [];
  for (const line of lines) {
    if (!countsAsRunning(line)) continue;
    const start = isValidLocalDate(line.start) ? line.start : from;
    const end = endOf(line);
    const every = line.everyMonths;
    // Skip the whole periods that ended before the path starts (one period early, so a clamped day is never skipped).
    const behind = monthNumber(from) - monthNumber(start);
    let k = Math.max(0, Math.floor(behind / every) - 1);
    for (;;) {
      const date = addMonthsClamped(start, k * every);
      if (date >= stopAt || (end !== null && date > end)) break;
      if (date >= from) out.push({ date, id: line.id, amount: line.amount });
      k += 1;
    }
  }
  out.sort(byDateThenId);
  return out.map((f) => ({ date: f.date, amount: f.amount }));
}

/** What the lines take from a usual month in `month` ('YYYY-MM'): each line's amount / every months, half up, summed. */
export function monthlyShare(lines: readonly RunningCostLine[], month: YearMonth): MinorUnits {
  const first = `${month}-01`;
  let sum = 0n;
  for (const line of lines) {
    if (!countsAsRunning(line)) continue;
    const end = endOf(line);
    if (end !== null && end < first) continue;
    sum += divideHalfUp(BigInt(line.amount), BigInt(line.everyMonths));
  }
  return minorFromBigInt(sum, FN);
}
