/**
 * This month projected to month end (v3 §4.3/§4.4; I2, I21, D-02).
 * Closes B1/B2: everyday spending never stops at day d. Erest, the everyday still to come, is floored by both the
 * typical rate over the days left and whatever of a typical month is not yet logged.
 * Pure: no clock, no I/O. Arithmetic is bigint, back through minorFromBigInt.
 */
import { divideHalfUp } from '../../../money/rounding';
import { minorUnits, type MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { addYearMonths, daysBetween, daysInYearMonth, dayOfMonth, yearMonthOf } from '../dates';
import type { IncomeThisMonth, V3Month, V3Series } from '../types';
import { classifyLine, liveSeriesOf, seriesIndex, seriesOccurrences } from './series';

const FN = 'thisMonth';
/** A paid line this close to a due date settles that occurrence. */
const MATCH_DAYS = 3;

/** max(divideHalfUp(E*(N-d), N), max(0, E - logged)). RangeError when day is outside 1..N. */
export function erestOf(e: MinorUnits, everydayLogged: MinorUnits, day: number, daysInMonth: number): MinorUnits {
  if (!Number.isInteger(daysInMonth) || daysInMonth < 1) {
    throw new RangeError(`erestOf: daysInMonth ${daysInMonth} must be a positive integer`);
  }
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth) {
    throw new RangeError(`erestOf: day ${day} must be an integer from 1 to ${daysInMonth}`);
  }
  const eb = BigInt(e);
  const pace = divideHalfUp(eb * BigInt(daysInMonth - day), BigInt(daysInMonth));
  const gap = eb - BigInt(everydayLogged);
  const floor = gap > 0n ? gap : 0n;
  return minorFromBigInt(pace > floor ? pace : floor, 'erestOf');
}

export interface ThisMonthInput {
  readonly asOf: string;
  readonly current: V3Month | null;
  readonly series: readonly V3Series[];
  readonly income: IncomeThisMonth;
  readonly e: MinorUnits | null;
  readonly roughExpenses: MinorUnits | null;
  readonly setAside: MinorUnits;
}

export interface ThisMonthResult {
  readonly month: string;
  readonly day: number;
  readonly daysInMonth: number;
  readonly moneyIn: MinorUnits;
  readonly moneyOut: MinorUnits;
  readonly billsPaid: MinorUnits;
  readonly billsDue: MinorUnits;
  readonly everydayLogged: MinorUnits;
  readonly erest: MinorUnits;
  readonly setAside: MinorUnits;
  readonly monthLeft: MinorUnits;
  readonly largestLine: { readonly categoryId: string | null; readonly amount: MinorUnits } | null;
  readonly everydayUnknown: boolean;
}

export function thisMonth(input: ThisMonthInput): ThisMonthResult {
  const month = yearMonthOf(input.asOf);
  const day = dayOfMonth(input.asOf);
  const n = daysInYearMonth(month);
  const index = seriesIndex(input.series);

  let billsPaid = 0n;
  let everyday = 0n;
  let refunds = 0n;
  const byCategory = new Map<string | null, bigint>();
  const paidBillLines: { readonly seriesId: string; readonly date: string }[] = [];

  for (const l of input.current?.lines ?? []) {
    if (l.status !== 'paid' || yearMonthOf(l.date) !== month) continue;
    const amount = BigInt(Math.abs(l.amount));
    switch (classifyLine(l, index)) {
      case 'recurring_bill':
        billsPaid += amount;
        /* istanbul ignore else -- reason: classifyLine only returns recurring_bill for a line that has a seriesId; the check narrows the type */
        if (l.seriesId !== null) paidBillLines.push({ seriesId: l.seriesId, date: l.date });
        break;
      case 'everyday':
        everyday += amount;
        byCategory.set(l.categoryId, (byCategory.get(l.categoryId) ?? 0n) + amount);
        break;
      case 'refund':
        refunds += amount;
        break;
      default:
        break;
    }
  }
  everyday = everyday > refunds ? everyday - refunds : 0n;

  // Bills still due: occurrences in [asOf, first of next month) that no paid line of that series settles.
  const nextFirst = `${addYearMonths(month, 1)}-01`;
  const used = new Array<boolean>(paidBillLines.length).fill(false);
  let billsDue = 0n;
  for (const s of liveSeriesOf(input.series, input.asOf, 'bill')) {
    for (const date of seriesOccurrences(s, input.asOf, nextFirst)) {
      const hit = paidBillLines.findIndex(
        (p, i) => !used[i] && p.seriesId === s.id && Math.abs(daysBetween(p.date, date)) <= MATCH_DAYS
      );
      if (hit >= 0) {
        used[hit] = true;
        continue;
      }
      billsDue += BigInt(Math.abs(s.amount));
    }
  }

  const logged = minorFromBigInt(everyday, FN);
  let erest: MinorUnits;
  let everydayUnknown = false;
  if (input.e !== null) {
    erest = erestOf(input.e, logged, day, n);
  } else if (input.roughExpenses !== null) {
    const gap = BigInt(input.roughExpenses) - everyday;
    erest = minorFromBigInt(gap > 0n ? gap : 0n, FN);
  } else {
    erest = minorUnits(0);
    everydayUnknown = true;
  }

  const moneyIn = input.income.total;
  const out = billsPaid + billsDue + everyday + BigInt(erest) + BigInt(input.setAside);

  let largest: { categoryId: string | null; amount: bigint } | null = null;
  for (const [categoryId, amount] of byCategory) {
    if (
      largest === null ||
      amount > largest.amount ||
      (amount === largest.amount && (categoryId ?? '') < (largest.categoryId ?? ''))
    ) {
      largest = { categoryId, amount };
    }
  }

  return {
    month,
    day,
    daysInMonth: n,
    moneyIn,
    moneyOut: minorFromBigInt(out, FN),
    billsPaid: minorFromBigInt(billsPaid, FN),
    billsDue: minorFromBigInt(billsDue, FN),
    everydayLogged: logged,
    erest,
    setAside: input.setAside,
    monthLeft: minorFromBigInt(BigInt(moneyIn) - out, FN),
    largestLine: largest === null ? null : { categoryId: largest.categoryId, amount: minorFromBigInt(largest.amount, FN) },
    everydayUnknown,
  };
}
