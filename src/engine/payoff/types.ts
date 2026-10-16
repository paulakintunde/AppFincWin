/**
 * Payoff contracts for the Decide engine.
 *
 * Why a new brand: `ScaledRate` (money/rates.ts) forbids zero via parseRate,
 * but DEC-01/DEC-02 require a 0% APR and D-06 a 0% return. `Percent` uses the
 * SAME scale (RATE_SCALE, imported, never redefined) with zero allowed.
 * Values are percentages (22.9 means 22.9%), not fractions.
 */
import { RATE_SCALE } from '../money/rates';
import { minorUnits, type MinorUnits } from '../money/types';

export type Percent = bigint & { readonly __brand: 'Percent' };

export const PERCENT_SCALE: bigint = 10n ** BigInt(RATE_SCALE);
export const ONE_HUNDRED_PERCENT: bigint = 100n * PERCENT_SCALE;
/** Monthly rate r = apr / MONTHLY_RATE_DENOMINATOR (apr is a percentage, 12 months, /100). */
export const MONTHLY_RATE_DENOMINATOR: bigint = 1200n * PERCENT_SCALE;
export const ZERO_PERCENT = 0n as Percent;

const PERCENT_PATTERN = /^(\d{1,4})(?:\.(\d{1,10}))?$/;

export function percent(s: string): Percent {
  const match = PERCENT_PATTERN.exec(s);
  if (!match) {
    throw new RangeError(`percent: "${s}" is not a valid percentage`);
  }
  // Group 1 is mandatory in PERCENT_PATTERN, so it is always captured here.
  const whole = match[1]!;
  const frac = match[2] ?? '';
  return BigInt(whole + frac.padEnd(RATE_SCALE, '0')) as Percent;
}

export function percentFromScaled(n: bigint): Percent {
  if (n < 0n) {
    throw new RangeError(`percentFromScaled: ${n} must be >= 0`);
  }
  return n as Percent;
}

export function minorFromBigInt(value: bigint, fn: string): MinorUnits {
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > maxSafe || value < -maxSafe) {
    throw new RangeError(`${fn}: result exceeds Number.MAX_SAFE_INTEGER`);
  }
  return minorUnits(Number(value));
}

/** For counts such as months-to-save, and the D-64 rounded-up level payment; other money rounding uses divideHalfUp. */
export function ceilDivide(n: bigint, d: bigint): bigint {
  if (d <= 0n) {
    throw new RangeError('ceilDivide: divisor must be positive');
  }
  if (n < 0n) {
    throw new RangeError('ceilDivide: dividend must be >= 0');
  }
  return (n + d - 1n) / d;
}

export interface AmortisationResult {
  /** Level monthly payment (D-64: rounded up), every month before the last paying month. */
  readonly payment: MinorUnits;
  /** Month n: remaining balance plus that month's interest; never more than `payment` (D-64). */
  readonly finalPayment: MinorUnits;
  readonly months: number;
  /** Exactly principal + totalInterest. */
  readonly totalPaid: MinorUnits;
  readonly totalInterest: MinorUnits;
}

/** D-16: from the card record, pre-filled from the per-market table outside the engine; never an engine default. */
export interface CardMinimumTerms {
  /** Percentage of balance due as the minimum. */
  readonly minimumPercent: Percent;
  /** true: scheduled = percent-of-balance + this month's interest. */
  readonly interestAdded: boolean;
  /** Minimum floor, in the card's own currency. */
  readonly floor: MinorUnits;
}

export type MinimumOutcome = 'cleared' | 'never_clears' | 'exceeds_month_cap';

export interface MinimumPaymentResult {
  readonly outcome: MinimumOutcome;
  /** cleared: months to clear; never_clears: 1-based month the check fired; exceeds_month_cap: SIMULATION_MONTH_CAP. */
  readonly months: number;
  /** First scheduled payment. */
  readonly firstPayment: MinorUnits;
  /** null only for never_clears (unbounded). */
  readonly totalInterest: MinorUnits | null;
  /** 0 when cleared. */
  readonly remainingBalance: MinorUnits;
}
