// Pure (no React or I/O). 09-13: the single feature-access function. Checks run in the order plan, household, level (D-35):
// a switch can never turn on something a check above it rules out. The plan check reports a reason but never hides anything
// (the lock hides nothing, UI-SPEC 9b). Features above the level are hidden, not greyed (D-34), and a feature that already holds
// the person's records never hides (D-34).
import type { FeatureDef, FeatureId, Level } from './featureRegistry';

/** The first check that fails, or null when none does. */
export type AccessReason = 'plan' | 'household' | 'level' | null;

export interface FeatureAccess {
  id: FeatureId;
  /** Shown in the app and on the Features screen. */
  visible: boolean;
  /** In use now (visible and not ruled out). */
  on: boolean;
  reason: AccessReason;
  /** The person may flip the switch. */
  switchable: boolean;
  /** The feature already holds the person's records. */
  holdsData: boolean;
}

export interface AccessInput {
  def: FeatureDef;
  level: Level;
  /** undefined: the person never touched the switch. */
  switchOn: boolean | undefined;
  planWritable: boolean;
  sharesInHousehold: boolean;
  holdsData: boolean;
}

export function evaluateAccess(input: AccessInput): FeatureAccess {
  const { def, level, switchOn, planWritable, sharesInHousehold, holdsData } = input;
  const id = def.id as FeatureId;

  // Household: a feature that needs others needs the person to share money with them, whatever their level (TIER-06).
  if (def.needsHousehold && !sharesInHousehold) {
    return { id, visible: false, on: false, reason: planWritable ? 'household' : 'plan', switchable: false, holdsData };
  }

  // Level: a household feature that passed the household check ignores the level (TIER-06).
  const belowLevel = !def.needsHousehold && def.minLevel > level;
  let visible: boolean;
  if (holdsData) visible = true;
  else if (belowLevel) visible = switchOn === true;
  else visible = switchOn !== false;

  let reason: AccessReason = null;
  if (!planWritable) reason = 'plan';
  else if (belowLevel && !holdsData) reason = 'level';

  const switchable = planWritable && !holdsData;
  return { id, visible, on: visible, reason, switchable, holdsData };
}
