// 09-13: the level-derived Grow flags. Each flag is the visibility of its registry feature; growFeatureFlags() stays the pure merge.
import { useFeatureAccess } from '@/features/levels/useFeatureAccess';
import { growFeatureFlags, type GrowFeatureFlags } from './growFeatureFlags';

export function useGrowFeatureFlags(): GrowFeatureFlags {
  const goals = useFeatureAccess('goals').visible;
  const debts = useFeatureAccess('debts').visible;
  const investing = useFeatureAccess('investing').visible;
  const lots = useFeatureAccess('lots').visible;
  const growthIllustration = useFeatureAccess('growthIllustration').visible;
  const calculators = useFeatureAccess('calculators').visible;
  return growFeatureFlags({ goals, debts, investing, lots, growthIllustration, calculators });
}
