import type { RightAnswerFixture } from '../rightAnswers/schema';
import { cashMargin, overdraftRoom, pathLow, plainNet } from './plain';

/**
 * Rules the engine has not landed yet. A fixture that triggers one is skipped (and counted) by the comparison.
 * Each rule plan deletes its entry in the same merge that lands the rule on both sides. The list only shrinks.
 */
export interface PendingRule { fixId: string; applies: (f: RightAnswerFixture) => boolean; note: string }

const plan = (f: RightAnswerFixture): boolean => f.check.pay.mode === 'plan';

/**
 * The cash check passes or fails depending on whether bills still due are counted (the adapter gives them no due date yet).
 * With an overdraft (05.4-17), or a safety net that can lend (05.4-18), how far below 0 the account goes decides the answer too,
 * so any dip with bills still due waits.
 */
function duesDecideCash(f: RightAnswerFixture): boolean {
  if (f.check.price === null) return false;
  const cost = BigInt(f.check.price) + BigInt(f.check.oneOffFees);
  const withDues = cashMargin(f, cost, true);
  if (overdraftRoom(f) > 0n && f.thisMonth.billsDue > 0 && withDues < 0n) return true;
  const net = plainNet(f);
  if (net.lend > 0n && f.thisMonth.billsDue > 0 && withDues + net.above < 0n) return true;
  // 05.4-48 (D-52): with irregular pay the cash check reads the path, where the undated bills still due land on a guessed day;
  // when counting them decides whether the path stays above 0, the answer waits for their real due dates too.
  if (f.pay.irregular !== undefined && f.thisMonth.billsDue > 0) {
    const without = { ...f, thisMonth: { ...f.thisMonth, billsDue: 0 } };
    if ((pathLow(f, cost) + net.above < 0n) !== (pathLow(without, cost) + net.above < 0n)) return true;
  }
  return (withDues < 0n) !== (cashMargin(f, cost, false) < 0n);
}

/**
 * The adapter logs a fixture's everyday spending as one unlinked line; the engine reads an unlinked line near an unpaid
 * bill's amount as that bill's payment. Until the fixture has a bills list (FIN-11) such fixtures are skipped.
 */
function everydayLooksLikeBill(f: RightAnswerFixture): boolean {
  const t = f.thisMonth;
  if (t.billsDue === 0 || t.everydaySoFar === 0) return false;
  return Math.abs(t.everydaySoFar - f.usualMonth.bills) * 4 <= f.usualMonth.bills;
}

/** A fixture states bills part paid and part due; without a bills list the engine reads one bill payment as the whole series paid. */
function billsPartlyPaid(f: RightAnswerFixture): boolean {
  return f.thisMonth.billsPaid > 0 && f.thisMonth.billsDue > 0;
}

export const PENDING_RULES: PendingRule[] = [
  { fixId: 'FIN-11', applies: (f) => f.bills.some((b) => b.everyMonths === 3 || b.everyMonths === 12) || duesDecideCash(f) || everydayLooksLikeBill(f) || billsPartlyPaid(f), note: 'quarterly and yearly bills; bills still due need real due dates before they count in the cash check' },
  { fixId: 'FIN-04', applies: (f) => f.debts.length > 0, note: 'debt payments in the month' },
  // 05.4-51 (D-67): the usual month sets the regular saving aside too, so a month short only by its saving is short here as well.
  { fixId: 'FIN-06/FIN-07', applies: (f) => plan(f) || f.pay.amount < f.usualMonth.bills + f.usualMonth.everyday + (f.usualMonth.saving?.amount ?? 0), note: 'plan payments against the usual month; a usual month already short makes the 90-day cash look-ahead decide' },
  { fixId: 'FIN-05', applies: (f) => plan(f) && f.check.pay.mode === 'plan' && f.check.pay.apr !== null, note: 'expensive-borrowing warning' },
  { fixId: 'FIN-08', applies: (f) => f.check.yourAnswer != null, note: 'your answer versus the app' },
  { fixId: 'FIN-09', applies: () => true, note: 'afterBuy block: until it lands only the code is compared' },
  { fixId: 'FIN-15', applies: (f) => f.pay.lastThree !== null, note: 'variable pay from the last three' },
  { fixId: 'FIN-27', applies: (f) => f.check.taxPercent !== null || f.region !== null, note: 'tax by region' },
  { fixId: 'BO-05', applies: (f) => (f.check.runningCosts?.length ?? 0) > 0 || f.check.closingPercent != null || f.check.replaces != null || f.check.saveForIt === true || f.check.purchaseDate != null, note: 'running costs, selling the old one, save-for-it' },
];

export function pendingFixIds(f: RightAnswerFixture): string[] {
  return PENDING_RULES.filter((r) => r.applies(f)).map((r) => r.fixId);
}
