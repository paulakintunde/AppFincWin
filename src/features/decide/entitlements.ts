// D-16 / 09 D-04: one paid entitlement plus a read-only lock. There is no free tier after the trial, so no Decide part
// is paid on its own. Supersedes 05 D-17 (alternatives table free) and APP-18 (safety stays free): when locked, Decide
// does not run for anyone, so no answer is ever shown without its safety parts. Crisis links stay free in
// You > Free help (D-03).
import type { PlanView } from '@/features/plans/types';

/** The parts of Decide that need the plan like the rest of the app. None is sold on its own. */
export const DECIDE_PARTS = [
  'multipleOpenChecks',
  'setbacks',
  'decisionJournal',
  'payoffComparisons',
  'alternatives',
] as const;

export type DecidePart = (typeof DECIDE_PARTS)[number];

/** Always travel together with every answer: the safety net and the confidence sentence are safety, not features. */
export const SAFETY_PARTS = ['safetyNet', 'confidenceSentence', 'answer', 'footer'] as const;

export type SafetyPart = (typeof SAFETY_PARTS)[number];

/** D-02: a locked plan starts no new check, for anyone. Saved answers still open (read-only). */
export function canStartDecide(plan: Pick<PlanView, 'writable'>): boolean {
  return plan.writable;
}
