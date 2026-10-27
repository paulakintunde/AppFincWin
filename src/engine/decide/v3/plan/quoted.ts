// Quoted-payment check (05.1 C1, I36, I41, D-26).
// The engine works the payment out; the user may type the lender's figure. A gap above the per-currency tolerance is
// a fact to show. The scored payment is the larger of the two, so a low quote never makes a purchase look easier (I41).
// With no rate the quote is the only figure: its implied rate is reported, never defaulted (I36).
import { divideHalfUp } from '../../../money/rounding';
import type { MinorUnits } from '../../../money/types';
import { impliedApr } from '../../../payoff/impliedApr';
import { minorFromBigInt, type Percent } from '../../../payoff/types';
import type { Cadence } from '../types';
import { amortBase, assertCadence } from './cadence';

const FN = 'checkQuoted';

export type QuotedCheck =
  | { readonly kind: 'none' }
  | { readonly kind: 'matches'; readonly computed: MinorUnits; readonly quoted: MinorUnits }
  | {
      readonly kind: 'differs';
      readonly computed: MinorUnits;
      readonly quoted: MinorUnits;
      readonly gap: MinorUnits;
      readonly direction: 'higher' | 'lower';
    }
  | { readonly kind: 'from_quote'; readonly quoted: MinorUnits; readonly impliedApr: Percent | 'above_max' | null };

export interface QuotedInput {
  readonly computed: MinorUnits | null;
  readonly quoted: MinorUnits | null;
  readonly tolerance: MinorUnits;
  readonly financed: MinorUnits;
  readonly count: number;
  readonly cadence: Cadence;
  readonly timing: 'due' | 'ordinary';
}

export function checkQuoted(input: QuotedInput): QuotedCheck {
  const { computed, quoted, tolerance, financed, count, cadence, timing } = input;
  if (!Number.isSafeInteger(tolerance) || tolerance < 0) {
    throw new RangeError(`${FN}: tolerance ${tolerance} must be a non-negative integer`);
  }
  if (quoted === null) return { kind: 'none' };
  if (computed === null) {
    assertCadence(cadence, FN);
    const r = impliedApr({ financed, payment: quoted, count, periodsPerYear: amortBase(cadence), timing });
    if (r === null) return { kind: 'from_quote', quoted, impliedApr: null };
    if ('aboveMax' in r) return { kind: 'from_quote', quoted, impliedApr: 'above_max' };
    // Scaled-APR inverse: the per-base APR solved above is apr x every.
    const apr = divideHalfUp(r.apr, BigInt(cadence.every)) as Percent;
    return { kind: 'from_quote', quoted, impliedApr: apr };
  }
  const diff = BigInt(quoted) - BigInt(computed);
  const gapBig = diff < 0n ? -diff : diff;
  if (gapBig > BigInt(tolerance)) {
    return {
      kind: 'differs',
      computed,
      quoted,
      gap: minorFromBigInt(gapBig, FN),
      direction: diff > 0n ? 'higher' : 'lower',
    };
  }
  return { kind: 'matches', computed, quoted };
}

/** I41: the larger of the non-null payments; null when both are null. A quote never lowers the scored payment. */
export function scoredPayment(computed: MinorUnits | null, quoted: MinorUnits | null): MinorUnits | null {
  if (computed === null) return quoted;
  if (quoted === null) return computed;
  return quoted > computed ? quoted : computed;
}
