import type { RightAnswerFixture } from '../rightAnswers/schema';
import { plainShortPlan } from './plain';

/**
 * Rules the engine has not landed yet. A fixture that triggers one is skipped (and counted) by the comparison.
 * Each rule plan deletes its entry in the same merge that lands the rule on both sides. The list only shrinks.
 */
export interface PendingRule { fixId: string; applies: (f: RightAnswerFixture) => boolean; note: string }

const plan = (f: RightAnswerFixture): boolean => f.check.pay.mode === 'plan';

export const PENDING_RULES: PendingRule[] = [
  { fixId: 'FIN-04', applies: (f) => f.debts.length > 0, note: 'debt payments in the month' },
  // 05.4-51 (D-67): the usual month sets the regular saving aside too, so a month short only by its saving is short here as well.
  // 05.4-54 (D-68): a plan the plain calculator judges by cash (plainShortPlan) is no longer this rule's; the usual-month test stays.
  { fixId: 'FIN-06/FIN-07', applies: (f) => (plan(f) && !plainShortPlan(f)) || f.pay.amount < f.usualMonth.bills + f.usualMonth.everyday + (f.usualMonth.saving?.amount ?? 0), note: 'plan payments against the usual month; a usual month already short makes the 90-day cash look-ahead decide' },
  { fixId: 'FIN-05', applies: (f) => plan(f) && f.check.pay.mode === 'plan' && f.check.pay.apr !== null, note: 'expensive-borrowing warning' },
  { fixId: 'FIN-08', applies: (f) => f.check.yourAnswer != null, note: 'your answer versus the app' },
  { fixId: 'FIN-09', applies: () => true, note: 'afterBuy block: until it lands only the code is compared' },
  { fixId: 'FIN-15', applies: (f) => f.pay.lastThree !== null, note: 'variable pay from the last three' },
  { fixId: 'FIN-27', applies: (f) => f.check.taxPercent !== null || f.region !== null, note: 'tax by region' },
  // 05.4-54 (D-68): toEngineInputs maps every plan's first payment as a deferral with the pause question unanswered (and a plan
  // with no rate asks for one), so the engine asks first on a D-68 plan; table.test compares D-68 plans with the first payment
  // read as BR-16 reads it. This skip keeps only that shape out of the comparison.
  { fixId: 'BO-05', applies: (f) => (f.check.runningCosts?.length ?? 0) > 0 || f.check.closingPercent != null || f.check.replaces != null || f.check.saveForIt === true || f.check.purchaseDate != null || (plan(f) && plainShortPlan(f)), note: 'running costs, selling the old one, save-for-it; plan first-payment choices (D-68 plans)' },
];

export function pendingFixIds(f: RightAnswerFixture): string[] {
  return PENDING_RULES.filter((r) => r.applies(f)).map((r) => r.fixId);
}
