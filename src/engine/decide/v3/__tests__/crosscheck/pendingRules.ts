import type { RightAnswerFixture } from '../rightAnswers/schema';

/**
 * Rules the engine has not landed yet. A fixture that triggers one is skipped (and counted) by the comparison.
 * Each rule plan deletes its entry in the same merge that lands the rule on both sides. The list only shrinks.
 */
export interface PendingRule { fixId: string; applies: (f: RightAnswerFixture) => boolean; note: string }

const plan = (f: RightAnswerFixture): boolean => f.check.pay.mode === 'plan';

export const PENDING_RULES: PendingRule[] = [
  // 05.4-24: the FIN-09 entry (the afterBuy block) is deleted; plain.ts restates the month figure and crosscheck.test compares it.
  // 05.4-25: the FIN-27 entry (tax by region) is deleted; plain.ts restates the tax rule (plainTax, upFront) and fixtureArb draws
  // regions, typed rates and the "Price already includes tax" switch.
  // 05.4-23: the FIN-08 (your answer, low months) and FIN-15 (the lower of the set-up pay and the last three) entries are deleted;
  // plain.ts restates both (plainLowMonths, lowerPay). FIN-08 only changes plans, which stay out under BO-05 below; table.test pins them.
  // 05.4-22 (FIN-05): toEngineInputs now maps a plan's first payment in the engine's own choices (today, one period away, else a
  // deferral with no interest during the pause), and the FIN-05 entry (the expensive-borrowing rule) is deleted: its rule landed on
  // both sides, and crosscheck.test compares it on every random plan where both sides say the plan fits. Plans still stay out of
  // the whole-code comparison here: with them in (seed 0, 441 plans) the plain plan branch has no fits_unspent (a deposit paid from
  // earlier money), no overdraft and no FIN-06 this-month reading, which are not borrowing rules (deferred-items, 05.4-22).
  // 05.4-26 (BO-05 part A): running costs, closing costs and the purchase date landed on both sides (plain.ts runningShare,
  // runningDates, plainClosing, buyDay, laterMoney), and fixtureArb draws them on one-off checks, so the entry is narrowed to what
  // 05.4-27 owns (what a purchase replaces, selling the old one, save-for-it) and to plans (not ladder-complete, as before; D-98).
  // 05.4-27 (BO-05 part B, D-107): what a purchase replaces (stops and a sale) and save-for-it landed on both sides (plain.ts replacesDates,
  // saleNow, plainFreed; fixtureArb draws them on one-off checks), so the BO-05 entry is deleted. Plans stay out of the whole-answer
  // comparison under their own fix ID until the plain plan branch is ladder-complete; a later plan closes it before 05.4-43.
  // 05.4-28 (ENG-15, ENG-17; D-109, D-114): no pending entry. The price limits (plain.ts priceAsks, PLAIN_PRICE_LIMIT) and accounts
  // with no exchange rate (withoutUnrated) landed on both sides; crosscheck.test compares both on every random fixture (price 0 and
  // over the limit, plus an unrated account added). The unsaved-changes note and The cheaper one change no code or figure.
  { fixId: 'PLAIN-PLANS', applies: (f) => plan(f), note: 'plans (the plain plan branch is borrowing-complete, not ladder-complete; D-98, D-107); closed before 05.4-43' },
];

export function pendingFixIds(f: RightAnswerFixture): string[] {
  return PENDING_RULES.filter((r) => r.applies(f)).map((r) => r.fixId);
}
