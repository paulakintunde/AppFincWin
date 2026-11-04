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
import type { AfterBuy, MonthModel, Notice, Purchase, V3Line } from './types';

/** THE "this month after its plans" figure (D-22): MonthModel.monthLeft, money in (received + still due) less every planned outflow. */
export function monthAfterPlans(month: Pick<MonthModel, 'monthLeft'>): MinorUnits {
  return month.monthLeft;
}

/**
 * 05.4 D-86 (FIN-09b, owner 2026-11-04): money owed from last month comes off this month's big number, for everyone. The everyday
 * money now (the spending accounts less pots) is what they opened the month with plus this month's money in so far, less this
 * month's money out so far (paid lines dated this month; transfers between own accounts are neither). An opening below 0 is an
 * overdraft carried in, paid back from this month first: monthLeft drops by it, so only what is left of this month can go toward a
 * purchase ("it uses this month up"). Money carried in that is not an overdraft changes nothing (QE-09). Pay this month counts only
 * once it has arrived, so pay the month expects but has not received never looks like an overdraft (D-52).
 * BR-06: $400 now after $3,000 in and $1,500 + $600 out, so November opened at -$500: $300 - $500 = -$200 before buying.
 */
const MONEY_IN: ReadonlySet<V3Line['role']> = new Set(['income', 'refund', 'other_in', 'envelope_withdrawal']);

export function openingBalance(spendingNow: MinorUnits, lines: readonly V3Line[], month: string, debtPaidThisMonth: MinorUnits = minorUnits(0)): MinorUnits {
  // DB-10: "She has already paid $100 of it this month": a minimum paid this month and recorded on the debt left the account too
  let opening = BigInt(spendingNow) + BigInt(debtPaidThisMonth);
  for (const l of lines) {
    if (l.status !== 'paid' || l.date.slice(0, 7) !== month || l.role === 'own_transfer') continue;
    const amount = BigInt(Math.abs(l.amount));
    opening += MONEY_IN.has(l.role) ? -amount : amount;
  }
  return minorFromBigInt(opening, 'openingBalance');
}

/** The overdraft carried into the month: an opening below 0, else nothing. */
export function carriedOverdraft(opening: MinorUnits): MinorUnits {
  return minorUnits(opening < 0 ? -opening : 0);
}

/** The month with a carried overdraft taken off its figure; the month_heading_short notice follows the new figure. */
export function withCarried(month: MonthModel, carried: MinorUnits): MonthModel {
  if (carried <= 0) return month;
  const left = minorFromBigInt(BigInt(month.monthLeft) - BigInt(carried), 'withCarried');
  const heading = (n: Notice): boolean => n.code === 'month_heading_short';
  const had = month.notices.find(heading);
  const notice: Notice | null = left < 0 ? { code: 'month_heading_short', values: { ...(had?.values ?? {}), month: month.month, short: -left } } : null;
  const rest = month.notices.filter((n) => !heading(n));
  // the notice keeps its place: after typical_short when there is one, else first
  const at = rest.findIndex((n) => n.code !== 'typical_short');
  const notices = notice === null ? rest : at === -1 ? [...rest, notice] : [...rest.slice(0, at), notice, ...rest.slice(at)];
  return { ...month, monthLeft: left, carriedOverdraft: carried, notices };
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
