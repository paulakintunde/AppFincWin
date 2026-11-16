// D-12 / D-44: one hook for the Pro-gateable household features. Phase 9 points src/config/householdFeatures.ts
// at the real household entitlement; screens never read that config directly. The summary link is deferred (D-45).
import { householdFeatureEnabled, type HouseholdFeature } from '@/config/householdFeatures';

export type HouseholdFeatureKey = 'hh.weightSplit' | 'hh.amountSplit' | 'hh.categoryDefaults';

const FEATURE_FOR: Record<HouseholdFeatureKey, HouseholdFeature> = {
  'hh.weightSplit': 'weightSplits',
  'hh.amountSplit': 'amountSplits',
  'hh.categoryDefaults': 'categoryDefaults',
};

export function useFeature(key: HouseholdFeatureKey): boolean {
  return householdFeatureEnabled(FEATURE_FOR[key]);
}
