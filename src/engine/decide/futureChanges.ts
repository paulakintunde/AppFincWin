import type { CurrencyCode, MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';
import { isValidLocalDate, monthOf } from '../time/localDate';
import { FUTURE_CHANGE_MONTHS } from './constants';
import { assertCurrency } from './currency';
import type { FutureChange, WorstMonth, WorstMonthInput } from './types';

/**
 * The worst of the next 12 months under the user's known future changes (D-45, D-10).
 *
 * The window is months 1..FUTURE_CHANGE_MONTHS after the as-of month (a change in the as-of month itself is outside it;
 * 04-REPLAN-NOTES 2026-10-15 expansion, default 5). Each month applies every active dated change, floors income and
 * spending at 0, and the month with the lowest left wins (ties keep the earliest), so a later raise can never rescue
 * an earlier shortfall. The month ledger uses this result.
 *
 * Changes are the user's own amounts and are never re-shared. Spending changes affect the month test only: the D-02
 * month's costs and the cushion keep the logged average. D-53 negative purchase-linked changes join this list in 04-18.
 * All arithmetic is bigint; no clock is read.
 */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthAfter(asOf: string, k: number): string {
  if (!isValidLocalDate(asOf)) {
    throw new RangeError(`monthAfter: "${asOf}" is not a valid local date`);
  }
  if (!Number.isSafeInteger(k) || k < 0) {
    throw new RangeError(`monthAfter: k ${k} must be a non-negative integer`);
  }
  const [y, mo] = monthOf(asOf).split('-').map(Number) as [number, number];
  const index = y * 12 + (mo - 1) + k;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function changeActiveIn(change: FutureChange, month: string): boolean {
  return change.startMonth <= month && (change.endMonth === null || month <= change.endMonth);
}

export function assertValidChange(change: FutureChange, currency: CurrencyCode, fn: string): void {
  if (change.kind !== 'income' && change.kind !== 'spending') {
    throw new RangeError(`${fn}: change ${change.id} has an unknown kind`);
  }
  if (!Number.isSafeInteger(change.monthlyAmount)) {
    throw new RangeError(`${fn}: change ${change.id} monthlyAmount must be an integer`);
  }
  if (!MONTH_PATTERN.test(change.startMonth)) {
    throw new RangeError(`${fn}: change ${change.id} startMonth "${change.startMonth}" must be YYYY-MM`);
  }
  if (change.endMonth !== null) {
    if (!MONTH_PATTERN.test(change.endMonth)) {
      throw new RangeError(`${fn}: change ${change.id} endMonth "${change.endMonth}" must be YYYY-MM`);
    }
    if (change.endMonth < change.startMonth) {
      throw new RangeError(`${fn}: change ${change.id} ends before it starts`);
    }
  }
  assertCurrency(currency, change.currency, `change ${change.id}`, fn);
}

function assertNonNegative(value: MinorUnits, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`worstFutureMonth: ${name} ${value} must be a non-negative integer`);
  }
}

export function worstFutureMonth(input: WorstMonthInput): WorstMonth {
  const { asOf, currency, monthIncome, monthSpending, fixedOutgoings, changes } = input;
  if (!isValidLocalDate(asOf)) {
    throw new RangeError(`worstFutureMonth: asOf "${asOf}" is not a valid local date`);
  }
  assertNonNegative(monthIncome, 'monthIncome');
  assertNonNegative(monthSpending, 'monthSpending');
  assertNonNegative(fixedOutgoings, 'fixedOutgoings');
  for (const c of changes) assertValidChange(c, currency, 'worstFutureMonth');

  let best: { offset: number; month: string; inc: bigint; sp: bigint; left: bigint } | null = null;
  for (let k = 1; k <= FUTURE_CHANGE_MONTHS; k += 1) {
    const month = monthAfter(asOf, k);
    let inc = BigInt(monthIncome);
    let sp = BigInt(monthSpending);
    for (const c of changes) {
      if (!changeActiveIn(c, month)) continue;
      if (c.kind === 'income') inc += BigInt(c.monthlyAmount);
      else sp += BigInt(c.monthlyAmount);
    }
    if (inc < 0n) inc = 0n;
    if (sp < 0n) sp = 0n;
    const left = inc - sp - BigInt(fixedOutgoings);
    if (best === null || left < best.left) best = { offset: k, month, inc, sp, left };
  }
  const w = best!;
  return {
    month: w.month,
    offset: w.offset,
    income: minorFromBigInt(w.inc, 'worstFutureMonth'),
    spending: minorFromBigInt(w.sp, 'worstFutureMonth'),
    leftBefore: minorFromBigInt(w.left, 'worstFutureMonth'),
    incomeDelta: minorFromBigInt(w.inc - BigInt(monthIncome), 'worstFutureMonth'),
    spendingDelta: minorFromBigInt(w.sp - BigInt(monthSpending), 'worstFutureMonth'),
  };
}
