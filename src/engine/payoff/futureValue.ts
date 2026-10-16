/**
 * DEC-02: future value of a monthly contribution plus a seed (prototype
 * `dfv`). D-20: one half-up rounding of an exact rational. D-06: the default
 * return is 0%, enforced by callers passing a Percent; there is no default
 * parameter here.
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { MAX_TERM_MONTHS } from './constants';
import { MONTHLY_RATE_DENOMINATOR, minorFromBigInt, type Percent } from './types';

function assertMonths(months: number): void {
  if (!Number.isInteger(months) || months < 0 || months > MAX_TERM_MONTHS) {
    throw new RangeError(`futureValue: months ${months} must be an integer between 0 and ${MAX_TERM_MONTHS}`);
  }
}

function assertNonNegative(value: number, label: string): void {
  if (value < 0) {
    throw new RangeError(`futureValue: ${label} ${value} must be >= 0`);
  }
}

/**
 * The same value as `futureValue`, as an exact bigint that is never range-checked. 04-REVIEW ME-01: a user-entered rate
 * over a long horizon can grow past Number.MAX_SAFE_INTEGER; callers that must not throw (the Decide projections)
 * convert with minorOrNull and report the figure as out of range instead.
 */
export function futureValueExact(monthly: MinorUnits, apr: Percent, months: number, seed: MinorUnits): bigint {
  assertMonths(months);
  assertNonNegative(monthly, 'monthly');
  assertNonNegative(seed, 'seed');

  const n = BigInt(months);
  const S = BigInt(seed);
  const M = BigInt(monthly);
  if (months === 0 || apr === 0n) {
    return S + M * n;
  }
  // s(1+r)^n + m((1+r)^n - 1)/r with r = apr/D, multiplied through by D^n * apr.
  const D = MONTHLY_RATE_DENOMINATOR;
  const An = (D + apr) ** n;
  const Dn = D ** n;
  return divideHalfUp(S * An * apr + M * (An - Dn) * D, Dn * apr);
}

export function futureValue(monthly: MinorUnits, apr: Percent, months: number, seed: MinorUnits): MinorUnits {
  return minorFromBigInt(futureValueExact(monthly, apr, months, seed), 'futureValue');
}
