import type { RightAnswerFixture } from '../rightAnswers/schema';

/**
 * Rules the engine has not landed yet. A fixture that triggers one is skipped (and counted) by the comparison.
 * Each rule plan deletes its entry in the same merge that lands the rule on both sides. The list only shrinks.
 */
export interface PendingRule { fixId: string; applies: (f: RightAnswerFixture) => boolean; note: string }

const plan = (f: RightAnswerFixture): boolean => f.check.pay.mode === 'plan';

export const PENDING_RULES: PendingRule[] = [
  // 05.4-24: the FIN-09 entry (the afterBuy block) is deleted; plain.ts restates the month figure and crosscheck.test compares it.
  { fixId: 'FIN-27', applies: (f) => f.check.taxPercent !== null || f.region !== null, note: 'tax by region' },
  // 05.4-23: the FIN-08 (your answer, low months) and FIN-15 (the lower of the set-up pay and the last three) entries are deleted;
  // plain.ts restates both (plainLowMonths, lowerPay). FIN-08 only changes plans, which stay out under BO-05 below; table.test pins them.
  // 05.4-22 (FIN-05): toEngineInputs now maps a plan's first payment in the engine's own choices (today, one period away, else a
  // deferral with no interest during the pause), and the FIN-05 entry (the expensive-borrowing rule) is deleted: its rule landed on
  // both sides, and crosscheck.test compares it on every random plan where both sides say the plan fits. Plans still stay out of
  // the whole-code comparison here: with them in (seed 0, 441 plans) the plain plan branch has no fits_unspent (a deposit paid from
  // earlier money), no overdraft and no FIN-06 this-month reading, which are not borrowing rules (deferred-items, 05.4-22).
  { fixId: 'BO-05', applies: (f) => (f.check.runningCosts?.length ?? 0) > 0 || f.check.closingPercent != null || f.check.replaces != null || f.check.saveForIt === true || f.check.purchaseDate != null || plan(f), note: 'running costs, selling the old one, save-for-it; plans (the plain plan branch is borrowing-complete, not ladder-complete)' },
];

export function pendingFixIds(f: RightAnswerFixture): string[] {
  return PENDING_RULES.filter((r) => r.applies(f)).map((r) => r.fixId);
}
