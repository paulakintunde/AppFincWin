/**
 * 06.1 D-09, the big-buy rule (decide-spec "The big-buy rule"): after Check it, the stepper opens when the kind has running costs
 * (Car; Home is blocked earlier by D-02), it is paid over time, or the price with tax is over the engine's band-6 edge in the home
 * currency. The edge is read from the engine's fixed band table, never typed here; missing edges count as large (cautious).
 * 06.1-56 (H-9, CN-6): isBigBuy takes the loaded thresholds only (inputs.thresholds, built from the stored rates). Home waits for
 * them, so the same item and price route the same way on a cold and a warm start; a loading null is never read as "large".
 */
import { bandOf, homeThresholds, type HomeThresholds, type UsdRate } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money';

import type { ItemKind } from './kindWords';

/** Band 6 is where the engine starts asking for the whole plan (v3 5.2). */
const BIG_BAND = 6;

/** True when the price with tax is over the band-6 edge; band 15 (no edges) is large. */
export function isLargePrice(whole: MinorUnits, currency: string, usdRate: UsdRate | null, thresholds?: HomeThresholds | null): boolean {
  // 06.1-21: the screens hold the engine's own thresholds (inputs.thresholds), already built from the stored rates; use them as they are.
  return bandOf(whole, thresholds ?? homeThresholds(currency, usdRate)).band >= BIG_BAND;
}

export interface BigBuyInput {
  readonly kind: ItemKind | null;
  readonly payMode: 'once' | 'plan';
  readonly whole: MinorUnits;
  /** The engine's loaded thresholds (v3.inputs.thresholds): the band edges in the home currency at the stored rate. */
  readonly thresholds: HomeThresholds;
}

/** True when the check opens the stepper; false sends it straight to the answer. */
export function isBigBuy(input: BigBuyInput): boolean {
  if (input.kind === 'car' || input.kind === 'home') return true;
  if (input.payMode === 'plan') return true;
  return bandOf(input.whole, input.thresholds).band >= BIG_BAND;
}
