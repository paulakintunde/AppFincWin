/**
 * Phase 9 copy, owner-signed in .planning/phases/09-tiers-onboarding/09-WORDING.md (2026-11-19). plans.* namespace, one file per area.
 * Keys and text match that file row for row; src/i18n/__tests__/plansCopy.test.ts enforces it. Declarative, never advice.
 */
import { paywall } from './paywall';
import { subscription } from './subscription';
import { notices } from './notices';
import { householdPlans } from './household';

export const plans = {
  ...paywall,
  ...subscription,
  ...notices,
  ...householdPlans,
} as const;
