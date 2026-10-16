/**
 * DEC-01: level-payment amortisation (prototype `dpmt`), on integer minor
 * units and exact bigint rationals. D-64 (amends D-20): the level payment is
 * rounded UP to the minor unit; the schedule is then walked and the final
 * payment absorbs the residual, so totalPaid === principal + totalInterest
 * exactly and the final payment never exceeds the level payment.
 * No default APR exists: callers always pass a Percent.
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { MAX_TERM_MONTHS } from './constants';
import {
  MONTHLY_RATE_DENOMINATOR,
  ceilDivide,
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

interface LevelWalk {
  /** Month 1's payment: the level payment, or less when the balance clears in month 1. */
  readonly firstPayment: bigint;
  /** The last non-zero payment (04-REVIEW ME-03); 0 when nothing is financed. */
  readonly finalPayment: bigint;
  /** The last month with a payment; 0 when nothing is financed. */
  readonly lastMonth: number;
  readonly totalPaid: bigint;
  readonly totalInterest: bigint;
}

/** Walk the schedule at a level payment; month n pays whatever is left (the D-20 residual). */
function walkLevel(P: bigint, apr: Percent, months: number, payment: bigint): LevelWalk {
  const D = MONTHLY_RATE_DENOMINATOR;
  let bal = P;
  let totalInterest = 0n;
  let totalPaid = 0n;
  let finalPayment = 0n;
  let lastMonth = 0;
  let firstPayment = 0n;
  for (let k = 1; k <= months; k++) {
    const interest = divideHalfUp(bal * apr, D);
    const due = bal + interest;
    // Clamp: a rounded-up payment would otherwise overpay and drive the balance negative. Month n absorbs the residual.
    const paid = k === months || payment >= due ? due : payment;
    bal = due - paid;
    totalInterest += interest;
    totalPaid += paid;
    if (k === 1) firstPayment = paid;
    if (paid > 0n) {
      finalPayment = paid;
      lastMonth = k;
    }
  }
  return { firstPayment, finalPayment, lastMonth, totalPaid, totalInterest };
}

/**
 * D-64 (amends D-20): the level payment is the exact annuity payment rounded UP to the minor unit, so it never
 * undershoots and the final payment (remaining balance plus that month's interest) is never more than it. Each month's
 * interest is still rounded half-up (D-20), and when the monthly interest sits within half a unit of the payment that
 * rounding can leave the ceiling a fraction of a unit short of amortising; the payment then steps up one minor unit at a
 * time until the final payment fits under it. One step was the most ever needed across ~24,000 probed terms (0-999% APR,
 * 1-600 months, 0.01 to 90,000,000,000.00); the loop terminates because a payment of principal + first-month interest
 * clears in month 1.
 *
 * 04-REVIEW ME-03: a rounded-up payment can clear the balance before month n (1,000.00 at 22.9% over 600 months clears
 * in month 421). `months` is then the last month with a payment, `finalPayment` that last non-zero payment, and
 * `termMonths` the term asked for. With nothing financed, months and finalPayment are 0.
 */
export function amortise(principal: MinorUnits, apr: Percent, months: number): AmortisationResult {
  assertMonths(months);
  assertNonNegative(principal, 'principal');

  const D = MONTHLY_RATE_DENOMINATOR;
  const P = BigInt(principal);
  const n = BigInt(months);

  let payment: bigint;
  if (apr === 0n) {
    payment = ceilDivide(P, n);
  } else {
    // P*r*(1+r)^n / ((1+r)^n - 1) with r = apr/D, multiplied through by D^(n+1).
    // A ** n for n = 600 is a ~7,800-digit bigint and costs well under a millisecond.
    const An = (D + apr) ** n;
    const Dn = D ** n;
    payment = ceilDivide(P * apr * An, D * (An - Dn));
  }
  let walk = walkLevel(P, apr, months, payment);
  while (walk.finalPayment > payment) {
    payment += 1n;
    walk = walkLevel(P, apr, months, payment);
  }

  return {
    // The level payment as actually paid: when it would exceed the whole first month's balance plus interest, the
    // loan clears in month 1 and that smaller amount is the payment (so amortiseSchedule's one-segment case is equal).
    payment: minorFromBigInt(walk.firstPayment, 'amortise'),
    finalPayment: minorFromBigInt(walk.finalPayment, 'amortise'),
    months: walk.lastMonth,
    termMonths: months,
    totalPaid: minorFromBigInt(walk.totalPaid, 'amortise'),
    totalInterest: minorFromBigInt(walk.totalInterest, 'amortise'),
  };
}
