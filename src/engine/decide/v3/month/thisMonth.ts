/**
 * This month projected to month end (v3 §4.3/§4.4; I2, I21, D-02).
 * Closes B1/B2: everyday spending never stops at day d. Erest, the everyday still to come, is floored by both the
 * typical rate over the days left and whatever of a typical month is not yet logged.
 * Pure: no clock, no I/O. Arithmetic is bigint, back through minorFromBigInt.
 */
import { divideHalfUp } from '../../../money/rounding';
import { minorUnits, type MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { MATCH_DAYS } from '../constants';
import { addYearMonths, daysInYearMonth, dayOfMonth, yearMonthOf } from '../dates';
import type { IncomeThisMonth, V3Month, V3Series } from '../types';
import { classifyLine, liveSeriesOf, seriesIndex, seriesOccurrences } from './series';
import { matchWindowDays, settle, toPaidLine, type Due, type PaidLine } from './settle';

const FN = 'thisMonth';

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

  const nextFirst = `${addYearMonths(month, 1)}-01`;
  const monthStart = `${month}-01`;
  const paidLines = (input.current?.lines ?? []).filter((l) => l.status === 'paid' && yearMonthOf(l.date) === month);

  // D-51/D-56: a bill occurrence is settled only by a paid line that matches it (linked to its series, or typed or
  // imported with no link and the right amount). The due date passing settles nothing. One matcher: month/settle.ts (M-02).
  const due: Due[] = [];
  const cadenceOf = new Map<string, V3Series>();
  for (const s of liveSeriesOf(input.series, input.asOf, 'bill')) {
    cadenceOf.set(s.id, s);
    for (const date of seriesOccurrences(s, monthStart, nextFirst, input.asOf)) {
      due.push({ seriesId: s.id, date, amount: s.amount });
    }
  }
  const candidates: PaidLine[] = [];
  for (const l of paidLines) {
    const c = classifyLine(l, index);
    if (c === 'recurring_bill' || (c === 'everyday' && l.seriesId === null)) candidates.push(toPaidLine(l));
  }
  const { settled, usedLines } = settle(due, candidates, (id) =>
    matchWindowDays((cadenceOf.get(id) as V3Series).cadence, MATCH_DAYS),
  );

  let billsPaid = 0n;
  let everyday = 0n;
  let refunds = 0n;
  const byCategory = new Map<string | null, bigint>();

  for (const l of paidLines) {
    const amount = BigInt(Math.abs(l.amount));
    // A typed or statement line that settles a bill is that bill, counted once (D-51).
    if (usedLines.has(l.id)) {
      billsPaid += amount;
      continue;
    }
    switch (classifyLine(l, index)) {
      case 'recurring_bill':
        billsPaid += amount;
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

  // Bills still due: every occurrence this month that no paid line settled, however long ago its date was (D-51).
  let billsDue = 0n;
  for (const d of due) {
    if (!settled.has(`${d.seriesId}|${d.date}`)) billsDue += BigInt(Math.abs(d.amount));
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
