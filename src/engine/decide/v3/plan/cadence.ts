// Per-year maths for payment plans (05.1 D-01, D-19, I37).
// RESEARCH Pattern 3: scaled APR keeps payoff/ unchanged. PeriodsPerYear stays 12|26|52|4: a plan every N weeks is
// amortised at base 52 with apr x N; every N months at base 12 with apr x N. That equals native ppy 26 and 4 (A9).
import { divideHalfUp } from '../../../money/rounding';
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt, type Percent } from '../../../payoff/types';
import type { RecurringFreq } from '../../../recurring/schedule';
import { CADENCE_EVERY_MAX, CADENCE_EVERY_MIN } from '../constants';
import type { Cadence } from '../types';

export const WEEKLY: Cadence = Object.freeze({ unit: 'week', every: 1 });
export const BIWEEKLY: Cadence = Object.freeze({ unit: 'week', every: 2 });
export const MONTHLY: Cadence = Object.freeze({ unit: 'month', every: 1 });
export const QUARTERLY: Cadence = Object.freeze({ unit: 'month', every: 3 });
export const YEARLY: Cadence = Object.freeze({ unit: 'month', every: 12 });

export function assertCadence(c: Cadence, fn: string): void {
  if (c.unit !== 'week' && c.unit !== 'month') {
    throw new RangeError(`${fn}: unit "${String(c.unit)}" must be week or month`);
  }
  if (!Number.isInteger(c.every) || c.every < CADENCE_EVERY_MIN || c.every > CADENCE_EVERY_MAX) {
    throw new RangeError(`${fn}: every ${c.every} must be an integer from ${CADENCE_EVERY_MIN} to ${CADENCE_EVERY_MAX}`);
  }
}

/** The payoff base the cadence is amortised at. */
export function amortBase(c: Cadence): 52 | 12 {
  assertCadence(c, 'amortBase');
  return c.unit === 'week' ? 52 : 12;
}

/** Payments per year as a rational: num / den (every 4 weeks is 52/4 = 13). */
export function perYear(c: Cadence): { readonly num: number; readonly den: number } {
  return { num: amortBase(c), den: c.every };
}

/** apr x every, so that amortising at the base gives the per-period rate apr x every / base. */
export function scaledApr(apr: Percent, c: Cadence): Percent {
  assertCadence(c, 'scaledApr');
  return (apr * BigInt(c.every)) as Percent;
}

/** I37: divideHalfUp(payment x perYear, 12), within half a minor unit. */
export function monthlyEquivalentOf(payment: MinorUnits, c: Cadence): MinorUnits {
  const { num, den } = perYear(c);
  return minorFromBigInt(divideHalfUp(BigInt(payment) * BigInt(num), 12n * BigInt(den)), 'monthlyEquivalentOf');
}

/** The number of periods that fit a term in months; never below 1. */
export function countFromTerm(c: Cadence, termMonths: number): number {
  const { num, den } = perYear(c);
  if (!Number.isInteger(termMonths) || termMonths < 0) {
    throw new RangeError(`countFromTerm: termMonths ${termMonths} must be a non-negative integer`);
  }
  return Math.max(1, Number(divideHalfUp(BigInt(num) * BigInt(termMonths), 12n * BigInt(den))));
}

export function cadenceOfFreq(f: RecurringFreq): Cadence {
  switch (f) {
    case 'weekly':
      return WEEKLY;
    case 'fortnightly':
      return BIWEEKLY;
    case 'monthly':
      return MONTHLY;
    case 'quarterly':
      return QUARTERLY;
    case 'yearly':
      return YEARLY;
  }
}

export function sameCadence(a: Cadence, b: Cadence): boolean {
  return a.unit === b.unit && a.every === b.every;
}
