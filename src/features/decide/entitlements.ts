// D-16: one entitlement hook. Phase 5 returns true for every feature; Phase 9 switches them
// without touching screens. D-17: the alternatives table is NOT a Pro candidate.

export const PRO_CANDIDATES = [
  'multipleOpenChecks',
  'setbacks',
  'decisionJournal',
  'payoffComparisons',
] as const;

export type ProFeature = (typeof PRO_CANDIDATES)[number];

export function canUse(feature: ProFeature): boolean {
  void feature;
  return true;
}
