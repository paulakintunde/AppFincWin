// D-12 / D-44: the defaults for the household features. 09 TIER-06 (09-13): visibility now comes from useFeatureAccess
// (household check first, level ignored for hh.* once the person shares). Feature flags never grant paid access.
// The summary link (HH-12) is deferred (D-45) and has no switch here.
export const HOUSEHOLD_FEATURES = {
  weightSplits: true,
  amountSplits: true,
  categoryDefaults: true,
} as const;

export type HouseholdFeature = keyof typeof HOUSEHOLD_FEATURES;

export function householdFeatureEnabled(feature: HouseholdFeature): boolean {
  return HOUSEHOLD_FEATURES[feature];
}
