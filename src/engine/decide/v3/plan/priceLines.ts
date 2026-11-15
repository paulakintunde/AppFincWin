/**
 * 05.5-26 (ARC-03): the price after tax, fees and trade-ins. Moved from the old resolvePriceInputs (its price rule only) so the
 * Past screens read the final price of a stored check without the old engine. Pure, integer minor units, no clock.
 */
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';

const FN = 'priceAfterLines';

/** One price line as the screens store it, its amount already worked out (a tax line from the advertised price). */
export interface PriceLine {
  readonly amount: MinorUnits;
  readonly effect: 'adds' | 'takes_off';
  readonly counted: boolean;
}

/** The advertised price plus the counted lines that add, less the counted lines that take off; never below 0. */
export function priceAfterLines(advertised: MinorUnits, lines: readonly PriceLine[]): MinorUnits {
  let net = 0n;
  for (const l of lines) {
    if (!l.counted) continue;
    net += l.effect === 'adds' ? BigInt(l.amount) : -BigInt(l.amount);
  }
  const price = BigInt(advertised) + net;
  return minorFromBigInt(price > 0n ? price : 0n, FN);
}
