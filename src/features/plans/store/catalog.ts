// 09-10: pure package choice and store change rules. No SDK import: this file is tested without the store.
// The rules follow 09-RESEARCH (replacement-mode matrix) and D-08 / D-16 / D-17: upgrades now, downgrades at renewal,
// and the app knows which before the person taps Confirm.
import type { ChangeTiming, PlanKey, PlanPeriod } from '../types';

export const PLAN_SIZES = { solo: 1, duo: 2, household: 6, extended: 12 } as const satisfies Record<PlanKey, number>;
export const PLAN_RANK = { solo: 0, duo: 1, household: 2, extended: 3 } as const satisfies Record<PlanKey, number>;
export const PLAN_KEYS: readonly PlanKey[] = ['solo', 'duo', 'household', 'extended'];

export type StorePlatform = 'ios' | 'android';
export type GoogleChangeMode = 'CHARGE_FULL_PRICE' | 'WITHOUT_PRORATION' | 'CHARGE_PRORATED_PRICE' | 'DEFERRED';

export function packageIdFor(plan: PlanKey, period: PlanPeriod): string {
  return `${plan}_${period}`;
}

/** Only Solo and Duo carry a free trial. */
export function planHasTrial(plan: PlanKey): boolean {
  return plan === 'solo' || plan === 'duo';
}

/** iPhone: a person whose trial is used buys the no-trial products (solo and duo only). Everything else is 'default'. */
export function offeringFor(args: { platform: StorePlatform; trialAvailable: boolean; plan: PlanKey }): 'default' | 'no_trial' {
  if (args.platform === 'ios' && !args.trialAvailable && planHasTrial(args.plan)) return 'no_trial';
  return 'default';
}

/** D-44: a household of N people cannot pick a plan with fewer than N seats. */
export function plansThatFit(members: number): PlanKey[] {
  return PLAN_KEYS.filter((p) => PLAN_SIZES[p] >= members);
}

export interface ChangeArgs {
  from: { plan: PlanKey; period: PlanPeriod; inTrial: boolean; billingIssue: boolean };
  to: { plan: PlanKey; period: PlanPeriod };
  platform: StorePlatform;
}

export type ChangeRule = { timing: ChangeTiming; googleMode?: GoogleChangeMode } | { blocked: 'fixPaymentFirst' };

export function changeRule({ from, to, platform }: ChangeArgs): ChangeRule {
  // Owner P6: a plan that is failing to renew is repaired first; the store would refuse or double-charge a change.
  if (from.billingIssue) return { blocked: 'fixPaymentFirst' };

  const fromRank = PLAN_RANK[from.plan];
  const toRank = PLAN_RANK[to.plan];

  if (toRank === fromRank) {
    if (from.period === to.period) return { timing: 'renewal' };
    // Same plan, other period. Apple groups switch at renewal; Google takes a month-to-year change now at full price.
    if (platform === 'ios') return { timing: 'renewal' };
    return to.period === 'year' ? { timing: 'now', googleMode: 'CHARGE_FULL_PRICE' } : { timing: 'renewal', googleMode: 'DEFERRED' };
  }

  // Any downgrade waits for renewal.
  if (toRank < fromRank) return { timing: 'renewal', googleMode: 'DEFERRED' };

  // Upgrades.
  if (from.inTrial) {
    // Moving between the two trial plans keeps the trial running; moving into a plan with no trial starts paying now.
    return planHasTrial(to.plan)
      ? { timing: 'trialContinues', googleMode: 'WITHOUT_PRORATION' }
      : { timing: 'now', googleMode: 'CHARGE_FULL_PRICE' };
  }
  return from.period === to.period
    ? { timing: 'now', googleMode: 'CHARGE_PRORATED_PRICE' }
    : { timing: 'now', googleMode: 'CHARGE_FULL_PRICE' };
}
