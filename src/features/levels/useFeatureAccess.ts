// 09-13: the single feature-access seam. Plan, household, level in that order (D-35); see evaluateAccess.
// A missing level (existing users, a load, or an unset row) reads as 4 so nothing is ever hidden by a gap (T-09-50).
import { useMemo } from 'react';
import { useFeatureSwitches } from '@/data/queries/userSetup';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePlanState } from '@/features/plans/usePlanState';
import { evaluateAccess, featureSwitchesOpen, type FeatureAccess } from './evaluateAccess';
import { FEATURES, featureById, type FeatureDef, type FeatureId, type Level } from './featureRegistry';
import { useHoldsData, type HoldsDataProbeId } from './useHoldsData';
import { useUserSetup } from './useUserSetup';

export { useUserSetup } from './useUserSetup';

interface Ctx {
  level: Level;
  switches: Record<string, boolean>;
  planWritable: boolean;
  sharesInHousehold: boolean;
  holds: Record<HoldsDataProbeId, boolean>;
}

/** 09-23: a level and switch map not applied yet (the onboarding summary's Features preview). */
export interface AccessPreview {
  level: Level;
  switches: Record<string, boolean>;
}

function useCtx(preview?: AccessPreview): Ctx {
  const { user } = useAuth();
  const plan = usePlanState();
  const setup = useUserSetup();
  const switches = useFeatureSwitches(user?.id).data;
  const holds = useHoldsData();
  return {
    level: preview?.level ?? setup.data?.level ?? 4,
    switches: preview?.switches ?? switches ?? {},
    planWritable: featureSwitchesOpen(plan), // 09-25: sample keeps the switches working
    sharesInHousehold: plan.members >= 2,
    holds,
  };
}

function accessFor(def: FeatureDef, c: Ctx): FeatureAccess {
  return evaluateAccess({
    def,
    level: c.level,
    switchOn: c.switches[def.id],
    planWritable: c.planWritable,
    sharesInHousehold: c.sharesInHousehold,
    holdsData: def.holdsData === null ? false : c.holds[def.holdsData as HoldsDataProbeId],
  });
}

export function useFeatureAccess(id: FeatureId): FeatureAccess {
  const c = useCtx();
  const def = featureById(id) as FeatureDef;
  return useMemo(() => accessFor(def, c), [def, c.level, c.switches, c.planWritable, c.sharesInHousehold, c.holds]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useAllFeatureAccess(preview?: AccessPreview): readonly FeatureAccess[] {
  const c = useCtx(preview);
  return useMemo(() => FEATURES.map((f) => accessFor(f, c)), [c.level, c.switches, c.planWritable, c.sharesInHousehold, c.holds]); // eslint-disable-line react-hooks/exhaustive-deps
}
