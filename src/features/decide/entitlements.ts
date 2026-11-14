// D-16: one entitlement hook. Phase 5 returns true for every feature; Phase 9 switches them
// without touching screens. D-17: the alternatives table is NOT a Pro candidate.

export const PRO_CANDIDATES = [
  'multipleOpenChecks',
  'setbacks',
  'decisionJournal',
  'payoffComparisons',
] as const;

export type ProFeature = (typeof PRO_CANDIDATES)[number];

/** APP-18: never paid. The safety net and the confidence sentence are safety, not features. */
export const ALWAYS_FREE = ['safetyNet', 'confidenceSentence', 'answer', 'footer'] as const;

export type AlwaysFree = (typeof ALWAYS_FREE)[number];

/** APP-18: one switch per Pro candidate; all off until Phase 9 turns them on. */
export const PRO_SWITCHES: Readonly<Record<ProFeature, boolean>> = {
  multipleOpenChecks: false,
  setbacks: false,
  decisionJournal: false,
  payoffComparisons: false,
};

export function canUseWith(
  switches: Readonly<Record<ProFeature, boolean>>,
  feature: ProFeature,
  isPro: boolean,
): boolean {
  return !switches[feature] || isPro;
}

export function canUse(feature: ProFeature, isPro = false): boolean {
  return canUseWith(PRO_SWITCHES, feature, isPro);
}
