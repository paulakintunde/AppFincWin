/**
 * The depletion lines (05.4 D-54, D-60, D-63) and the D-65 tiers. Pure; integer minor units; facts only, never a code or a figure elsewhere.
 *
 * They apply when the usual month is known and either:
 * - it is already short before the purchase (D-63: any answer but an ask; D-54 Short each month and Not yet, D-60a Dips), or
 * - a plan's own payment makes it short (D-60b), on Short each month or Not yet.
 * In order: the shortfall (depletion_payment, usual_month_short or plan_makes_short); price_over_net; net_lasts and
 * net_lasts_without (only while the net is unlocked, D-61: no locked amount is shown as usable); interest_is_a_cost (a plan with
 * interest; 05.4-22 widens it to every plan answer, D-48); balanced_month_room; month_balance_gap (already short, D-63).
 * The interest line's total is deposit and fees paid on day one plus every plan payment: a first payment dated asOf is inside both
 * dayOne and schedule.totalPaid, so it is taken out of dayOne once (Plan-49 re-run, 2026-11-03: it was counted twice).
 *
 * monthShortTier (D-65, owner 2026-11-03, replaces D-63's single headline): "when the usual month is already short before the
 * purchase, the headline depends on how much the purchase eats into the money propping up the month. 'How long your money lasts'
 * = months the spare money + extra savings (never locked safety-net money, D-61) can cover the usual monthly shortfall. Small (cuts
 * it by less than 1 month): 'Fits, but your month is already short' ... Moderate (cuts it by 1 month or more): 'Fits from [spare
 * money / extra savings], but your month is already short' ... Large (needs the locked safety net, takes the 90-day path below $0,
 * or a plan payment makes the month more short): 'No: your month is already short' (D-63's variant)."
 *
 * D-68 (shortPlanCash): a short plan judged by cash reads as a one-off purchase of its whole cost. Its monthly figure does not make
 * the usual month more short (the payments end inside the 90 days), so there is no depletion_payment and no plan_makes_short (the
 * short_plan_from_cash caution line says it instead); an already-short month gets the lines a one-off gets, and the interest line
 * still shows on a plan with interest (D-48).
 */
import { minorUnits, type MinorUnits } from '../../money/types';
import { myPart, type ResolvedShare } from '../share';
import type { ResolvedNet } from './safetyNet';
import type { Code, Fact, Schedule } from './types';

const FN = 'depletion';

export interface DepletionInput {
  readonly code: Code;
  /** The purchase's monthly cost (my share). */
  readonly monthly: MinorUnits;
  /** The whole price (my share). */
  readonly whole: MinorUnits;
  readonly dayOne: MinorUnits;
  readonly schedule: Schedule | null;
  readonly share: ResolvedShare;
  readonly typicalLeft: MinorUnits | null;
  readonly typicalIncome: MinorUnits;
  readonly net: ResolvedNet;
  /** Money the split takes from the net's account. */
  readonly netTaken: MinorUnits;
  /** My share of the plan payments dated asOf; already inside dayOne and inside schedule.totalPaid. */
  readonly firstNow: MinorUnits;
  /** 05.4 D-68: a short plan judged by cash, like a one-off purchase of its whole cost. */
  readonly shortPlanCash?: boolean;
}

/**
 * A plan's whole cost, my share: deposit and fees paid on day one plus every plan payment once. A first payment dated asOf is
 * inside both dayOne and schedule.totalPaid (firstNow), so it is taken out of dayOne once (Plan-49 re-run). The interest line's
 * total and D-68's whole cost (judge/shortPlan.ts) are this one figure.
 */
export function planTotal(dayOne: MinorUnits, schedule: Schedule, share: ResolvedShare, firstNow: MinorUnits): MinorUnits {
  return minorUnits(dayOne - firstNow + myPart(schedule.totalPaid, share));
}

function interestFacts(d: DepletionInput): Fact[] {
  if (d.schedule === null || d.schedule.totalInterest <= 0) return [];
  return [{ code: 'interest_is_a_cost', values: { interest: myPart(d.schedule.totalInterest, d.share), total: planTotal(d.dayOne, d.schedule, d.share, d.firstNow) } }];
}

/** The usual month is already short before the purchase (D-63). */
export function monthAlreadyShort(typicalLeft: MinorUnits | null): boolean {
  return typicalLeft !== null && typicalLeft < 0;
}

export function depletionFacts(d: DepletionInput): Fact[] {
  const TL = d.typicalLeft;
  if (TL === null || d.code === 'needs_input') return [];
  const cash = d.shortPlanCash === true;
  const M = cash ? 0 : d.monthly;
  const already = TL < 0;
  const planMakesShort = !already && M > 0 && TL - M < 0 && (d.code === 'monthly_short' || d.code === 'not_yet');
  if (!already && !planMakesShort) return cash ? interestFacts(d) : [];
  const out: Fact[] = [];
  const shortAfter = M - TL;
  if (already && M > 0) out.push({ code: 'depletion_payment', values: { monthly: M, shortBefore: minorUnits(-TL), shortAfter: minorUnits(shortAfter) } });
  else if (already) out.push({ code: 'usual_month_short', values: { short: minorUnits(-TL) } });
  else out.push({ code: 'plan_makes_short', values: { short: minorUnits(shortAfter) } });
  const net = d.net;
  if (net.saved > 0 && d.whole > net.saved) out.push({ code: 'price_over_net', values: { price: d.whole, net: net.saved } });
  if (!net.locked && !net.off && net.saved > 0) {
    const left = net.saved - d.netTaken > 0 ? net.saved - d.netTaken : 0;
    out.push({ code: 'net_lasts', values: { shortfall: minorUnits(shortAfter), months: Number(BigInt(left) / BigInt(shortAfter)) } });
    if (already && (M > 0 || d.netTaken > 0)) out.push({ code: 'net_lasts_without', values: { months: Number(BigInt(net.saved) / BigInt(-TL)) } });
  }
  out.push(...interestFacts(d));
  out.push({ code: 'balanced_month_room', values: { pay: d.typicalIncome, costs: minorUnits(d.typicalIncome - TL) } });
  if (already) out.push({ code: 'month_balance_gap', values: { gap: minorUnits(-TL) } });
  return out;
}

export type ShortTier = 'month_short_small' | 'month_short_moderate' | 'month_short_moderate_extra' | 'month_already_short';

export interface TierInput {
  readonly code: Code;
  /** The purchase's monthly cost (my share). */
  readonly monthly: MinorUnits;
  /** The usual month's leftover; below 0 here. */
  readonly typicalLeft: MinorUnits;
  /** The spare money judged against (this month and earlier, D-56 capped); null with no confirmed figure. */
  readonly spare: MinorUnits | null;
  readonly monthLeft: MinorUnits;
  /** Extra savings: money saved above the net's size (D-56), plus unlocked goals kept outside the spending accounts (06 D-22, spareSavings). The protected net is never counted (D-61). */
  readonly aboveSize: MinorUnits;
  /** What the purchase takes from spare money and extra savings (day one less its own envelope). */
  readonly used: MinorUnits;
  /** The split's extra_savings amount. */
  readonly fromExtra: MinorUnits;
}

/**
 * D-65: the headline when the usual month is already short. Large ('month_already_short', no tier fact) on any code but a cash fit
 * (fits_month / fits_unspent), or with a monthly cost. Otherwise R = spare money (else this month's left, never below 0) + extra
 * savings, never below what the purchase uses; S = the usual shortfall. used < S: Small, with month_short_fits. Else Moderate (from
 * extra savings when the split takes some), with money_lasts_shorter: floor(R / S) months before, floor((R - used) / S) after. The shortfall
 * itself is the usual_month_short line below it; the owner's wording names no figure ("at this shortfall").
 */
export function monthShortTier(t: TierInput): { readonly variant: ShortTier; readonly fact: Fact | null } {
  if (t.typicalLeft >= 0) throw new RangeError(`${FN}: the usual month is not short`);
  const S = -t.typicalLeft;
  if ((t.code !== 'fits_month' && t.code !== 'fits_unspent') || t.monthly > 0) return { variant: 'month_already_short', fact: null };
  const own = t.spare ?? t.monthLeft;
  const money = (own > 0 ? own : 0) + (t.aboveSize > 0 ? t.aboveSize : 0);
  const R = money > t.used ? money : t.used;
  if (t.used < S) return { variant: 'month_short_small', fact: { code: 'month_short_fits', values: { price: t.used, money: minorUnits(R), short: minorUnits(S) } } };
  const months = Number(BigInt(R) / BigInt(S));
  const monthsAfter = Number(BigInt(R - t.used) / BigInt(S));
  return {
    variant: t.fromExtra > 0 ? 'month_short_moderate_extra' : 'month_short_moderate',
    fact: { code: 'money_lasts_shorter', values: { months, monthsAfter } },
  };
}
