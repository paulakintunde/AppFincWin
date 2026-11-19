// D-12 / D-44, 09-13: one hook for the household split features. Visibility comes from useFeatureAccess (the household check runs
// first and household features ignore the level, TIER-06); a feature that already holds splits never hides once the household check passes (D-34, D-35).
// Screens never read src/config/householdFeatures.ts directly. The summary link is deferred (D-45).
import type { FeatureId } from '@/features/levels/featureRegistry';
import { useFeatureAccess } from '@/features/levels/useFeatureAccess';

export type HouseholdFeatureKey = 'hh.weightSplit' | 'hh.amountSplit' | 'hh.categoryDefaults';

const FEATURE_FOR: Record<HouseholdFeatureKey, FeatureId> = {
  'hh.weightSplit': 'hh.weightSplit',
  'hh.amountSplit': 'hh.amountSplit',
  'hh.categoryDefaults': 'hh.categoryDefaults',
};

export function useFeature(key: HouseholdFeatureKey): boolean {
  // evaluateAccess already shows a feature that holds records; adding holdsData here would bypass the household check (D-35).
  return useFeatureAccess(FEATURE_FOR[key]).visible;
}
