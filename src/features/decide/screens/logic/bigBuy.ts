/**
 * 06.1 D-09, the big-buy rule (decide-spec "The big-buy rule"): after Check it, the stepper opens when the kind has running costs
 * (Car; Home is blocked earlier by D-02), it is paid over time, or the price with tax is over the engine's band-6 edge in the home
 * currency. The edge is read from the engine's fixed band table, never typed here; missing edges count as large (cautious).
 */
import { bandOf, homeThresholds, type UsdRate } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money';

import type { ItemKind } from './kindWords';

/** Band 6 is where the engine starts asking for the whole plan (v3 5.2). */
const BIG_BAND = 6;

/** True when the price with tax is over the band-6 edge; band 15 (no edges) is large. */
export function isLargePrice(whole: MinorUnits, currency: string, usdRate: UsdRate | null): boolean {
  return bandOf(whole, homeThresholds(currency, usdRate)).band >= BIG_BAND;
}

export interface BigBuyInput {
  readonly kind: ItemKind | null;
  readonly payMode: 'once' | 'plan';
  readonly whole: MinorUnits;
  readonly currency: string;
  readonly usdRate: UsdRate | null;
}

/** True when the check opens the stepper; false sends it straight to the answer. */
export function isBigBuy(input: BigBuyInput): boolean {
  if (input.kind === 'car' || input.kind === 'home') return true;
  if (input.payMode === 'plan') return true;
  return isLargePrice(input.whole, input.currency, input.usdRate);
}
