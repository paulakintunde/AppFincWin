import { ZERO_PERCENT, type Percent } from '../payoff/types';
import { MAX_PROJECTION_RATES } from './constants';
import type { ProjectionRate } from './types';

/**
 * The one projection-rate list every Decide projection uses (D-51): 0% first (held, not grown), then the user's
 * entered rates deduplicated in entry order. prepareContext (04-07) stores the result in `limits.projectionRates`;
 * alternatives (04-10), do_without (04-09) and the investment views (04-21) all read that one list.
 *
 * The engine never supplies a non-zero rate: every rate here was typed by the user (D-51), and 0% is always
 * included (D-06). The labels are codes; Phase 5 words the non-zero one as a projection at the rate the user entered
 * (DCU-09). A user-entered 0% appears once, marked as entered.
 */
export function resolveProjectionRates(rates: readonly Percent[], fn: string): readonly ProjectionRate[] {
  if (rates.length > MAX_PROJECTION_RATES) {
    throw new RangeError(`${fn}: at most ${MAX_PROJECTION_RATES} projection rates, got ${rates.length}`);
  }
  for (const rate of rates) {
    if (rate < 0n) {
      throw new RangeError(`${fn}: a projection rate must be >= 0%`);
    }
  }
  const entered = new Set<Percent>(rates);
  const resolved: ProjectionRate[] = [
    { rate: ZERO_PERCENT, userEntered: entered.has(ZERO_PERCENT), label: 'held_not_grown' },
  ];
  for (const rate of entered) {
    if (rate !== ZERO_PERCENT) {
      resolved.push({ rate, userEntered: true, label: 'projection_at_entered_rate' });
    }
  }
  return resolved;
}
