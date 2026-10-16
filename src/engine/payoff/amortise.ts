/**
 * DEC-01: level-payment amortisation (prototype `dpmt`), on integer minor
 * units and exact bigint rationals. D-20: the level payment is rounded
 * half-up exactly once; the schedule is then walked and the final payment
 * absorbs the residual, so totalPaid === principal + totalInterest exactly.
 * No default APR exists: callers always pass a Percent.
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { MAX_TERM_MONTHS } from './constants';
import {
  MONTHLY_RATE_DENOMINATOR,
  minorFromBigInt,
  type AmortisationResult,
  type Percent,
} from './types';

function assertMonths(months: number): void {
  if (!Number.isInteger(months) || months < 1 || months > MAX_TERM_MONTHS) {
    throw new RangeError(`amortise: months ${months} must be an integer between 1 and ${MAX_TERM_MONTHS}`);
  }
}

function assertNonNegative(value: number, label: string): void {
  if (value < 0) {
    throw new RangeError(`amortise: ${label} ${value} must be >= 0`);
  }
}

export function amortise(principal: MinorUnits, apr: Percent, months: number): AmortisationResult {
  assertMonths(months);
  assertNonNegative(principal, 'principal');

  const D = MONTHLY_RATE_DENOMINATOR;
  const P = BigInt(principal);
  const n = BigInt(months);

  let payment: bigint;
  if (apr === 0n) {
    payment = divideHalfUp(P, n);
  } else {
    // P*r*(1+r)^n / ((1+r)^n - 1) with r = apr/D, multiplied through by D^(n+1).
    // A ** n for n = 600 is a ~7,800-digit bigint and costs well under a millisecond.
    const An = (D + apr) ** n;
    const Dn = D ** n;
    payment = divideHalfUp(P * apr * An, D * (An - Dn));
  }

  let bal = P;
  let totalInterest = 0n;
  let totalPaid = 0n;
  for (let k = 1; k < months; k++) {
    const interest = divideHalfUp(bal * apr, D);
    const due = bal + interest;
    // Clamp: a rounded-up payment on a tiny principal would otherwise overpay
    // and drive the balance (and the final payment) negative.
    const paid = payment < due ? payment : due;
    bal = due - paid;
    totalInterest += interest;
    totalPaid += paid;
  }
  const finalInterest = divideHalfUp(bal * apr, D);
  const finalPayment = bal + finalInterest;
  totalInterest += finalInterest;
  totalPaid += finalPayment;

  return {
    payment: minorFromBigInt(payment, 'amortise'),
    finalPayment: minorFromBigInt(finalPayment, 'amortise'),
    months,
    totalPaid: minorFromBigInt(totalPaid, 'amortise'),
    totalInterest: minorFromBigInt(totalInterest, 'amortise'),
  };
}
