/**
 * GRW-07: one debt paid at a fixed monthly amount, with an optional extra each
 * month or a one-off lump taken off before the first month's interest
 * (prototype `payoff`). All bigint, one divideHalfUp per month.
 *
 * Same guards as simulateMinimum (D-17): `never_clears` is an explicit
 * per-month check (payment cannot cover that month's interest); the
 * SIMULATION_MONTH_CAP is its own outcome and never inferred as never-clears.
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { SIMULATION_MONTH_CAP } from './constants';
import { MONTHLY_RATE_DENOMINATOR, minorFromBigInt, type Percent } from './types';

const FN = 'fixedPayoff';

export type PayoffOutcome = 'cleared' | 'never_clears' | 'exceeds_month_cap';

export interface FixedPayoffResult {
  outcome: PayoffOutcome;
  months: number;
  lastPayment: MinorUnits;
  totalInterest: MinorUnits | null;
  remainingBalance: MinorUnits;
}

export function fixedPayoff(
  balance: MinorUnits,
  apr: Percent,
  payment: MinorUnits,
  opts: { extra?: MinorUnits; lump?: MinorUnits } = {}
): FixedPayoffResult {
  const extra = opts.extra ?? 0;
  const lump = opts.lump ?? 0;
  if (balance < 0 || payment < 0 || extra < 0 || lump < 0) {
    throw new RangeError(`${FN}: balance, payment, extra and lump must be >= 0`);
  }
  const pay = BigInt(payment) + BigInt(extra);
  let bal = BigInt(balance) - BigInt(lump);
  if (bal <= 0n) {
    return {
      outcome: 'cleared',
      months: 0,
      lastPayment: minorFromBigInt(0n, FN),
      totalInterest: minorFromBigInt(0n, FN),
      remainingBalance: minorFromBigInt(0n, FN),
    };
  }

  let month = 0;
  let totalInterest = 0n;
  let last = 0n;
  while (bal > 0n) {
    if (month === SIMULATION_MONTH_CAP) {
      return {
        outcome: 'exceeds_month_cap',
        months: month,
        lastPayment: minorFromBigInt(last, FN),
        totalInterest: minorFromBigInt(totalInterest, FN),
        remainingBalance: minorFromBigInt(bal, FN),
      };
    }
    const interest = divideHalfUp(bal * apr, MONTHLY_RATE_DENOMINATOR);
    const due = bal + interest;
    const paid = pay < due ? pay : due;
    month += 1;
    if (paid <= interest) {
      return {
        outcome: 'never_clears',
        months: month,
        lastPayment: minorFromBigInt(last, FN),
        totalInterest: null,
        remainingBalance: minorFromBigInt(bal, FN),
      };
    }
    totalInterest += interest;
    last = paid;
    bal = due - paid;
  }
  return {
    outcome: 'cleared',
    months: month,
    lastPayment: minorFromBigInt(last, FN),
    totalInterest: minorFromBigInt(totalInterest, FN),
    remainingBalance: minorFromBigInt(0n, FN),
  };
}
