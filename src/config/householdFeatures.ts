// D-12 / D-44: one switch per Pro-gateable household feature. All true until Phase 9 points
// these at the real household entitlement. The summary link (HH-12) is deferred (D-45) and has no switch here.
export const HOUSEHOLD_FEATURES = {
  weightSplits: true,
  amountSplits: true,
  categoryDefaults: true,
} as const;

export type HouseholdFeature = keyof typeof HOUSEHOLD_FEATURES;

export function householdFeatureEnabled(feature: HouseholdFeature): boolean {
  return HOUSEHOLD_FEATURES[feature];
}
