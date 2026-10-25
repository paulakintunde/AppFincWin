/**
 * DEC-01: level-payment amortisation (prototype `dpmt`), on integer minor
 * units and exact bigint rationals. D-64 (amends D-20): the level payment is
 * rounded UP to the minor unit; the schedule is then walked and the final
 * payment absorbs the residual, so totalPaid === principal + totalInterest
 * exactly and the final payment never exceeds the level payment.
 * No default APR exists: callers always pass a Percent. D-89: `periodsPerYear` (default 12) sets the period length;
 * the count `months` is then a count of periods.
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { MAX_TERM_MONTHS } from './constants';
import {
  ceilDivide,
  minorFromBigInt,
  rateDenominator,
  type AmortisationResult,
  type Percent,
  type PeriodsPerYear,
} from './types';

/** D-89: the count is of periods (months by default); the cap is the same 600. */
function assertPeriods(periods: number): void {
  if (!Number.isInteger(periods) || periods < 1 || periods > MAX_TERM_MONTHS) {
    throw new RangeError(`amortise: periods ${periods} must be an integer between 1 and ${MAX_TERM_MONTHS}`);
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

/**
 * Walk the schedule at a level payment; the last payment absorbs whatever is left (the D-20 residual). Ordinary
 * (`due` false): payments in months 1..months, interest accrues before each. Annuity-due (`due` true, D-80): payments
 * in months 0..months-1, the first on the day with no interest yet. `lastMonth` is the count of payments up to the last
 * non-zero one (equal to the last month index for an ordinary walk).
 */
function walkLevel(
  P: bigint,
  apr: Percent,
  months: number,
  payment: bigint,
  due: boolean,
  D: bigint,
): LevelWalk {
  let bal = P;
  let totalInterest = 0n;
  let totalPaid = 0n;
  let finalPayment = 0n;
  let lastMonth = 0;
  let firstPayment = 0n;
  const offset = due ? 1 : 0;
  const start = 1 - offset;
  const end = months - offset;
  for (let k = start; k <= end; k++) {
    const interest = k === 0 ? 0n : divideHalfUp(bal * apr, D);
    const owed = bal + interest;
    // Clamp: a rounded-up payment would otherwise overpay and drive the balance negative. The last month absorbs the residual.
    const paid = k === end || payment >= owed ? owed : payment;
    bal = owed - paid;
    totalInterest += interest;
    totalPaid += paid;
    if (k === start) firstPayment = paid;
    if (paid > 0n) {
      finalPayment = paid;
      lastMonth = k + offset;
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
export function amortise(
  principal: MinorUnits,
  apr: Percent,
  months: number,
  periodsPerYear: PeriodsPerYear = 12,
): AmortisationResult {
  return solve(principal, apr, months, false, periodsPerYear);
}

/**
 * D-80 (UI-SPEC R15.7 E1.2): the same plan with the first payment on the day (an annuity-due). The exact payment is the
 * ordinary one divided by (1 + r), P*r*(1+r)^(n-1) / ((1+r)^n - 1), in the same bigint form, then rounded up and stepped
 * up exactly as D-64. The walk pays at month 0 before any interest, then accrues and pays in months 1..n-1. `months` is
 * the number of payments (the last is paid in month `months - 1`); `termMonths` is the count asked for.
 */
export function amortiseDue(
  principal: MinorUnits,
  apr: Percent,
  months: number,
  periodsPerYear: PeriodsPerYear = 12,
): AmortisationResult {
  return solve(principal, apr, months, true, periodsPerYear);
}

function solve(
  principal: MinorUnits,
  apr: Percent,
  months: number,
  due: boolean,
  periodsPerYear: PeriodsPerYear,
): AmortisationResult {
  assertPeriods(months);
  assertNonNegative(principal, 'principal');

  // D-89: the rate per period is apr / (100 x periodsPerYear x scale); 12 is the monthly denominator, unchanged.
  const D = rateDenominator(periodsPerYear);
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
    // Due: divide by (1 + r) = (D + apr) / D, so the factor D in the denominator becomes D + apr.
    payment = ceilDivide(P * apr * An, (due ? D + apr : D) * (An - Dn));
  }
  let walk = walkLevel(P, apr, months, payment, due, D);
  while (walk.finalPayment > payment) {
    payment += 1n;
    walk = walkLevel(P, apr, months, payment, due, D);
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
