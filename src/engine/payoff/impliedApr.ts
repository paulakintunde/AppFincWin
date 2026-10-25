/**
 * D-90 (UI-SPEC R16.6, R16.11 E4): the true nominal APR implied by an instalment plan with no quoted rate. Exact
 * integer bisection on the percent scale; the present value of the payments is compared with the amount financed by
 * cross-multiplied bigint rationals. No floats, no division inside the search. A read-out only: it never enters
 * assess() and never pre-fills a field (04 D-07).
 */
import type { MinorUnits } from '../money/types';
import { PERCENT_SCALE, ceilDivide, percent, type Percent } from './types';

/** Payoff-side copy of the 999.99% ceiling (decide's MAX_APR_PERCENT has the same value); the solver never imports decide. */
export const MAX_APR: Percent = percent('999.99');
/** A guard on the instalment count so a typed figure cannot make the powers unreasonably large. */
export const MAX_IMPLIED_APR_COUNT = 5000;

export type ImpliedAprTiming = 'due' | 'ordinary';

export interface ImpliedAprInput {
  /** Amount financed, as D-49 defines it, in minor units. */
  readonly financed: MinorUnits;
  /** Each instalment, in minor units. */
  readonly payment: MinorUnits;
  /** Number of instalments. */
  readonly count: number;
  /** Instalments per year (12 monthly, 26 or 52 for pay cycles). */
  readonly periodsPerYear: number;
  /** 'due': the first instalment is on the day; 'ordinary': one period on. */
  readonly timing: ImpliedAprTiming;
  /** The search ceiling; defaults to 999.99%. */
  readonly maxApr?: Percent;
}

export type ImpliedAprResult = { readonly apr: Percent } | { readonly aboveMax: true } | null;

/** base ** exp by squaring, on bigints. */
function powBySquaring(base: bigint, exp: number): bigint {
  let result = 1n;
  let b = base;
  let e = exp;
  while (e > 0) {
    if ((e & 1) === 1) result *= b;
    e = Math.floor(e / 2);
    if (e > 0) b *= b;
  }
  return result;
}

function assertWhole(value: number, label: string, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`impliedApr: ${label} ${value} must be a safe integer >= ${min}`);
  }
}

/**
 * Smallest apr (in PERCENT_SCALE units) at which the payments' present value no longer exceeds `financed`, or
 * `{ aboveMax: true }` when even `maxApr` leaves it above. The upper bound of the final one-unit bracket is returned
 * (the conservative side). null when the figures carry no rate: nothing financed, a single payment on the day, or a
 * total below the amount financed. A total equal to the amount financed is 0%.
 */
export function impliedApr(input: ImpliedAprInput): ImpliedAprResult {
  const { financed, payment, count, periodsPerYear, timing } = input;
  const maxApr: bigint = input.maxApr ?? MAX_APR;
  assertWhole(financed, 'financed', 0);
  assertWhole(payment, 'payment', 0);
  assertWhole(count, 'count', 1);
  assertWhole(periodsPerYear, 'periodsPerYear', 1);
  if (count > MAX_IMPLIED_APR_COUNT) {
    throw new RangeError(`impliedApr: count ${count} exceeds ${MAX_IMPLIED_APR_COUNT}`);
  }
  const due = timing === 'due';
  const F = BigInt(financed);
  const total = BigInt(payment) * BigInt(count);
  if (F === 0n || (due && count === 1) || total < F) return null;
  if (total === F) return { apr: 0n as Percent };

  // r = apr / Dp, so 1 + r = (Dp + apr) / Dp. Ordinary PV = pay * Dp * (A^n - Dp^n) / (A^n * apr), A = Dp + apr;
  // due multiplies that by A / Dp. Compare PV > F as pay * num * (A^n - Dp^n) > F * A^n * apr, all integers.
  const Dp = 100n * BigInt(periodsPerYear) * PERCENT_SCALE;
  const Dn = powBySquaring(Dp, count);
  const P = BigInt(payment);
  const exceeds = (apr: bigint): boolean => {
    const A = Dp + apr;
    const An = powBySquaring(A, count);
    return P * (due ? A : Dp) * (An - Dn) > F * An * apr;
  };

  if (exceeds(maxApr)) return { aboveMax: true };
  let lo = 0n; // PV exceeds financed (total > financed)
  let hi = maxApr; // PV is at or below financed
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (exceeds(mid)) lo = mid;
    else hi = mid;
  }
  return { apr: hi as Percent };
}

/** The solved rate as text, rounded UP to one decimal ('18.5' for 18.41); whole values drop the decimal ('0', '18'). */
export function impliedAprDisplay(apr: Percent): string {
  const tenths = ceilDivide(apr, PERCENT_SCALE / 10n);
  const whole = tenths / 10n;
  const frac = tenths % 10n;
  return frac === 0n ? whole.toString() : `${whole}.${frac}`;
}
