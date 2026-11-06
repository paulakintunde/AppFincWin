/**
 * 05.4 BO-08 (D-12, D-147): the fixed shadow sample set, the same 6 purchases for every tester. Prices are whole units of the
 * tester's home currency (60 pounds for a GBP tester, no exchange rate) and include tax (taxIncluded), so no region changes
 * them. The two plan terms are fixed sample terms, never stored as a user's rate (ARC-25). Ids match the decide_shadow_runs
 * sample_id CHECK (shadow/__tests__/schemaGuard.test.ts).
 */
import { currencyExponent } from '../../../money/currencyExponents';
import { minorUnits, type MinorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import type { CheckV2, PayV2, V3PresetItemType } from '../types';

export const SHADOW_SAMPLE_IDS = ['s60', 'p500', 'l2000', 'c9000_cash', 'c9000_plan', 'f1200_plan'] as const;
export type ShadowSampleId = (typeof SHADOW_SAMPLE_IDS)[number];

export interface ShadowSample {
  readonly id: ShadowSampleId;
  readonly check: CheckV2;
}

interface SampleSpec {
  readonly id: ShadowSampleId;
  readonly units: number;
  readonly itemType: V3PresetItemType;
  readonly plan: { readonly count: number; readonly aprText: string } | null;
}

const SPECS: readonly SampleSpec[] = [
  { id: 's60', units: 60, itemType: 'general', plan: null },
  { id: 'p500', units: 500, itemType: 'electronics', plan: null },
  { id: 'l2000', units: 2000, itemType: 'electronics', plan: null },
  { id: 'c9000_cash', units: 9000, itemType: 'vehicle', plan: null },
  { id: 'c9000_plan', units: 9000, itemType: 'vehicle', plan: { count: 48, aprText: '9.9' } },
  { id: 'f1200_plan', units: 1200, itemType: 'general', plan: { count: 12, aprText: '0' } },
];

const ZERO = minorUnits(0);

function payOf(plan: SampleSpec['plan']): PayV2 {
  if (plan === null) return { mode: 'once' };
  return {
    mode: 'plan',
    cadence: { unit: 'month', every: 1 },
    count: plan.count,
    termMonths: null,
    apr: percent(plan.aprText),
    fees: { setup: ZERO, perPeriod: ZERO, end: ZERO },
    deposit: ZERO,
    tradeIn: ZERO,
    quotedPayment: null,
    firstPayment: { kind: 'one_period' },
    deferredInterestTerm: false,
  };
}

function checkOf(spec: SampleSpec, price: MinorUnits): CheckV2 {
  return {
    v: 2,
    legacyKind: 'buy',
    price,
    taxPercent: null,
    taxIncluded: true,
    oneOffFees: ZERO,
    itemType: { kind: 'preset', value: spec.itemType },
    categoryId: null,
    purpose: null,
    emergency: false,
    envelopeId: null,
    pay: payOf(spec.plan),
    extras: {},
    value: { earnsMonthly: null, savesMonthly: null, useYears: null, cheaperPrice: null },
    share: { kind: 'personal' },
    foreign: null,
    layerAnswers: {},
  };
}

/** The 6 samples priced in `currency` (D-147: the same numbers in the tester's own currency, scaled by its minor-unit exponent). */
export function shadowSamples(currency: string): readonly ShadowSample[] {
  const scale = 10 ** currencyExponent(currency);
  return SPECS.map((spec) => ({ id: spec.id, check: checkOf(spec, minorUnits(spec.units * scale)) }));
}
