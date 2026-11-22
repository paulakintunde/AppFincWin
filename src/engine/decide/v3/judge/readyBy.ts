/**
 * 08.1 D-05 / D-06: the first day a fresh check would keep the account at or above the floor for the next 90 days.
 *
 * Candidate start days are the check day itself, every payday, then the 1st of each month, in date order, up to `maxMonths` calendar
 * months after the check day. For each one, `lowestFrom` reads a fresh 90-day window opened that day (the opening balance rolled
 * forward on the no-purchase path, the purchase applied as if bought that day) and returns its lowest balance. The first candidate
 * not before `notBefore` whose lowest point is at or above `floor` is the date.
 *
 * Pure: integer minor units, no I/O. The cash maths lives in the caller's `lowestFrom` (prepare.ts), so this file is only the search.
 *
 * Result: { date } - the first safe day; { beyond: true } - no candidate inside the limit stays safe (D-06: no date is given);
 * null - no candidate could be read at all (the caller keeps the date it already had).
 */
import { addMonthsClamped, firstOfMonth, yearMonthOf, addYearMonths } from '../dates';

export type SafeStart = { readonly date: string } | { readonly beyond: true } | null;

export interface SafeStartInput {
  readonly asOf: string;
  /** Pay dates after asOf (any order, any range; those past the limit are ignored). */
  readonly paydays: readonly string[];
  /** The earliest day a date may be given (the date as judged): never earlier. */
  readonly notBefore: string;
  /** 12 under D-06. */
  readonly maxMonths: number;
  /** 0, or the line the window must stay at or above. */
  readonly floor: number;
  /** Lowest balance of a fresh 90-day window opened on `start` with the purchase bought that day; null when it cannot be read. */
  readonly lowestFrom: (start: string) => number | null;
}

/** The candidate days: asOf, paydays and 1sts, sorted, unique, none past the limit. */
export function candidateStarts(asOf: string, paydays: readonly string[], maxMonths: number): readonly string[] {
  const limit = addMonthsClamped(asOf, maxMonths);
  const days = new Set<string>([asOf]);
  for (const d of paydays) if (d > asOf && d <= limit) days.add(d);
  let ym = yearMonthOf(asOf);
  // the 1st of each of the next maxMonths months always falls after asOf and on or before the limit
  for (let n = 1; n <= maxMonths; n++) {
    ym = addYearMonths(ym, 1);
    days.add(firstOfMonth(ym));
  }
  return [...days].sort();
}

export function firstSafeStart(input: SafeStartInput): SafeStart {
  const limit = addMonthsClamped(input.asOf, input.maxMonths);
  if (input.notBefore > limit) return { beyond: true };
  let read = false;
  for (const start of candidateStarts(input.asOf, input.paydays, input.maxMonths)) {
    if (start < input.notBefore) continue;
    const lowest = input.lowestFrom(start);
    if (lowest === null) continue;
    read = true;
    if (lowest >= input.floor) return { date: start };
  }
  return read ? { beyond: true } : null;
}
