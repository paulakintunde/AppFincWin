/**
 * The one after-purchase figure (05.4 FIN-09 / ENG-05 / UX-02, 05.4-24; D-22, D-23, D-24, D-44, D-57). Pure; integer minor units.
 *
 * D-22: for a one-off the big figure is this month after its plans (expected pay, bills and usual spending counted) minus the
 * purchase: "November would still leave about $25." Decide Home shows the same figure before the purchase. D-23: expected pay later
 * this month counts on its date (thisMonth's income.total = received + still due); the 90-day path still checks the bills before
 * payday. A plan leads with the usual month once payments start (owner, 2026-11-01).
 *
 * What the purchase takes from this month's figure (thisMonthCost):
 * - an answer with a funding split: the parts that come from this month (the month and, on Dips into your safety net, the protected
 *   money it takes). Money left from earlier months (spare money, extra savings) and the purchase's own envelope are not this month's
 *   money: the answer states them (earlier_money_from, D-44; envelope_used), so this month gives what it has and the rest is named
 *   (BR-17: "This month ends at $500 - $500 = $0", BR-22: a month already at -$100 stays at -$100);
 * - an answer without one (Not yet, Short each month, an ask): the whole day-one cost (OD-04: $750 - $600 = $150);
 * - a plan, not judged by cash (D-68), also loses its payments due later this month (BR-06's 28 November payment). A plan whose
 *   first payment falls after this month says so (first_payment_later), the stated reason its month figure moves by its day-one
 *   cost only (D-24).
 *
 * The November mismatch (05.3 handoff item 1; novemberRepro.test.ts): Home read the months as given, while a check could be judged
 * on the stricter all-full reading (D-42), whose month figure differs. homeFigure reads the stricter of the readings' month figures
 * (D-42 for the month figure: thin history never makes this month look better), and every answer's afterBuy starts from it, so
 * Home and the answer differ by exactly what the purchase takes this month (I64).
 */
import type { MinorUnits } from '../../money/types';
import { minorUnits } from '../../money/types';
import { minorFromBigInt } from '../../payoff/types';
import { myPart } from '../share';
import { addDays, addYearMonths } from './dates';
import { paymentsInRange } from './plan/schedule';
import type { AfterBuy, MonthModel, Purchase } from './types';

/** THE "this month after its plans" figure (D-22): MonthModel.monthLeft, money in (received + still due) less every planned outflow. */
export function monthAfterPlans(month: Pick<MonthModel, 'monthLeft'>): MinorUnits {
  return month.monthLeft;
}

/** Decide Home's figure: the stricter (lower) of the readings' month figures, the same one every answer's afterBuy.before reads. */
export function homeFigure(prepared: { readonly readings: readonly { readonly month: Pick<MonthModel, 'monthLeft'> }[] }): MinorUnits {
  let low: MinorUnits | null = null;
  for (const r of prepared.readings) {
    const m = monthAfterPlans(r.month);
    if (low === null || m < low) low = m;
  }
  if (low === null) throw new RangeError('homeFigure: a Prepared has at least one reading');
  return low;
}

/** The plan's payments after today and before next month (my share); a payment today is in day one already. */
export function laterThisMonth(purchase: Pick<Purchase, 'schedule' | 'share'>, asOf: string, month: string): MinorUnits {
  const s = purchase.schedule;
  if (s === null) return minorUnits(0);
  let sum = 0n;
  for (const p of paymentsInRange(s, addDays(asOf, 1), `${addYearMonths(month, 1)}-01`)) sum += BigInt(myPart(p.amount, purchase.share));
  return minorFromBigInt(sum, 'laterThisMonth');
}

/** A plan whose first payment falls after this month (D-24's stated reason): its month figure holds its day-one cost only. */
export function firstPaymentLater(purchase: Pick<Purchase, 'schedule'>, month: string): boolean {
  return purchase.schedule !== null && purchase.schedule.firstDate >= `${addYearMonths(month, 1)}-01`;
}

export interface AfterBuyInput {
  readonly month: Pick<MonthModel, 'month' | 'monthLeft' | 'typicalLeft'>;
  readonly asOf: string;
  /** null when the check has no price yet (an ask): the figure is the month as it stands. */
  readonly purchase: Pick<Purchase, 'dayOne' | 'monthly' | 'runningMonthly' | 'schedule' | 'share'> | null;
  /** What the answer's funding split takes from this month (month + protected net money); null when the answer keeps no split. */
  readonly fromThisMonth: MinorUnits | null;
  /** 05.4 D-68: a short plan judged by cash; its split already holds every payment, and it leads with this month. */
  readonly byCash: boolean;
}

/** The block for one reading; prepare.ts re-bases it on homeFigure so every answer and Home share one month figure. */
export function afterBuyBlock(a: AfterBuyInput): AfterBuy {
  const before = monthAfterPlans(a.month);
  const p = a.purchase;
  if (p === null) return { lead: 'month', month: before, usualMonth: null, before, monthName: a.month.month };
  const taken = a.fromThisMonth ?? p.dayOne;
  const later = a.byCash ? 0 : laterThisMonth(p, a.asOf, a.month.month);
  const plan = p.schedule !== null;
  const usual = a.month.typicalLeft === null || (!plan && p.runningMonthly <= 0) ? null : minorFromBigInt(BigInt(a.month.typicalLeft) - BigInt(p.monthly), 'afterBuyBlock');
  return {
    lead: plan && !a.byCash ? 'usualMonth' : 'month',
    month: minorFromBigInt(BigInt(before) - BigInt(taken) - BigInt(later), 'afterBuyBlock'),
    usualMonth: usual,
    before,
    monthName: a.month.month,
  };
}

/** Re-base a reading's block on Home's figure: what the purchase takes this month is unchanged (I64). */
export function rebased(ab: AfterBuy, home: MinorUnits): AfterBuy {
  return ab.before === home ? ab : { ...ab, before: home, month: minorFromBigInt(BigInt(home) - (BigInt(ab.before) - BigInt(ab.month)), 'rebased') };
}
