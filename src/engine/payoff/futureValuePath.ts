/**
 * D-52: the net-worth path needs a future value at every month 0..n, so this
 * returns the whole series in one pass. D-20: each point is the same exact
 * rational as `futureValue` with ONE half-up rounding; rounded balances are
 * never iterated. A^m and D^m are carried as bigints and multiplied once a
 * month (cost: one multiplication a month, not a fresh exponentiation per
 * point).
 *
 * D-63: an optional holding fee reduces the growth. Net rate = entered rate
 * minus fee, as a signed value at PERCENT_SCALE, and it may go below 0 (a 0%
 * line with a 1% fee shrinks). The fee is user-entered only: callers pass
 * ZERO_PERCENT for none, the engine never supplies one. It is bounded to
 * 100% so the monthly factor (1 + net / 1200) stays positive.
 */
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { MAX_TERM_MONTHS } from './constants';
import { futureValueExact } from './futureValue';
import { MONTHLY_RATE_DENOMINATOR, ONE_HUNDRED_PERCENT, ZERO_PERCENT, minorFromBigInt, type Percent } from './types';

function assertInputs(fn: string, monthly: MinorUnits, months: number, seed: MinorUnits, holdingFee: Percent): void {
  if (!Number.isInteger(months) || months < 0 || months > MAX_TERM_MONTHS) {
    throw new RangeError(`${fn}: months ${months} must be an integer between 0 and ${MAX_TERM_MONTHS}`);
  }
  if (monthly < 0) {
    throw new RangeError(`${fn}: monthly ${monthly} must be >= 0`);
  }
  if (seed < 0) {
    throw new RangeError(`${fn}: seed ${seed} must be >= 0`);
  }
  if (holdingFee > ONE_HUNDRED_PERCENT) {
    throw new RangeError(`${fn}: holdingFee must be at most 100%`);
  }
}

/** The exact value at month `n` given An = (D + net)^n and Dn = D^n, one rounding. */
function valueAt(S: bigint, M: bigint, net: bigint, An: bigint, Dn: bigint, n: bigint): bigint {
  if (net === 0n) {
    return S + M * n;
  }
  const numerator = S * An * net + M * (An - Dn) * MONTHLY_RATE_DENOMINATOR;
  const denominator = Dn * net;
  // net < 0: both are negative and the value is positive; flip so half-up sees a positive rational.
  return net < 0n ? divideHalfUp(-numerator, -denominator) : divideHalfUp(numerator, denominator);
}

/** The path as exact bigints, never range-checked (04-REVIEW ME-01; see futureValueExact). */
export function futureValuePathExact(
  monthly: MinorUnits,
  apr: Percent,
  months: number,
  seed: MinorUnits,
  holdingFee: Percent
): readonly bigint[] {
  assertInputs('futureValuePath', monthly, months, seed, holdingFee);
  const net = apr - holdingFee;
  const D = MONTHLY_RATE_DENOMINATOR;
  const A = D + net;
  const S = BigInt(seed);
  const M = BigInt(monthly);
  const path: bigint[] = [S];
  let An = 1n;
  let Dn = 1n;
  for (let i = 1; i <= months; i += 1) {
    An *= A;
    Dn *= D;
    path.push(valueAt(S, M, net, An, Dn, BigInt(i)));
  }
  return path;
}

export function futureValuePath(
  monthly: MinorUnits,
  apr: Percent,
  months: number,
  seed: MinorUnits,
  holdingFee: Percent
): readonly MinorUnits[] {
  return futureValuePathExact(monthly, apr, months, seed, holdingFee).map((v) => minorFromBigInt(v, 'futureValuePath'));
}

/** futureValueNet as an exact bigint, never range-checked (04-REVIEW ME-01). */
export function futureValueNetExact(
  monthly: MinorUnits,
  apr: Percent,
  months: number,
  seed: MinorUnits,
  holdingFee: Percent
): bigint {
  assertInputs('futureValueNet', monthly, months, seed, holdingFee);
  if (holdingFee === ZERO_PERCENT) {
    return futureValueExact(monthly, apr, months, seed);
  }
  const net = apr - holdingFee;
  const n = BigInt(months);
  const A = MONTHLY_RATE_DENOMINATOR + net;
  return valueAt(BigInt(seed), BigInt(monthly), net, A ** n, MONTHLY_RATE_DENOMINATOR ** n, n);
}

export function futureValueNet(
  monthly: MinorUnits,
  apr: Percent,
  months: number,
  seed: MinorUnits,
  holdingFee: Percent
): MinorUnits {
  return minorFromBigInt(futureValueNetExact(monthly, apr, months, seed, holdingFee), 'futureValueNet');
}
