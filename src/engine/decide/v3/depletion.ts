/**
 * The depletion lines (05.4 D-54, D-60, D-63). Pure; integer minor units; facts only, never a code or a figure elsewhere.
 *
 * They apply when the usual month is known and either:
 * - it is already short before the purchase (D-63: any answer but an ask; D-54 Short each month and Not yet, D-60a Dips), or
 * - a plan's own payment makes it short (D-60b), on Short each month or Not yet.
 * In order: the shortfall (depletion_payment, usual_month_short or plan_makes_short); price_over_net; net_lasts and
 * net_lasts_without (only while the net is unlocked, D-61: no locked amount is shown as usable); interest_is_a_cost (a plan with
 * interest; 05.4-22 widens it to every plan answer, D-48); balanced_month_room; month_balance_gap (already short, D-63).
 */
import { minorUnits, type MinorUnits } from '../../money/types';
import { myPart, type ResolvedShare } from '../share';
import type { ResolvedNet } from './safetyNet';
import type { Code, Fact, Schedule } from './types';

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
}

/** The usual month is already short before the purchase (D-63). */
export function monthAlreadyShort(typicalLeft: MinorUnits | null): boolean {
  return typicalLeft !== null && typicalLeft < 0;
}

export function depletionFacts(d: DepletionInput): Fact[] {
  const TL = d.typicalLeft;
  if (TL === null || d.code === 'needs_input') return [];
  const M = d.monthly;
  const already = TL < 0;
  const planMakesShort = !already && M > 0 && TL - M < 0 && (d.code === 'monthly_short' || d.code === 'not_yet');
  if (!already && !planMakesShort) return [];
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
  if (d.schedule !== null && d.schedule.totalInterest > 0) {
    out.push({
      code: 'interest_is_a_cost',
      values: { interest: myPart(d.schedule.totalInterest, d.share), total: minorUnits(d.dayOne + myPart(d.schedule.totalPaid, d.share)) },
    });
  }
  out.push({ code: 'balanced_month_room', values: { pay: d.typicalIncome, costs: minorUnits(d.typicalIncome - TL) } });
  if (already) out.push({ code: 'month_balance_gap', values: { gap: minorUnits(-TL) } });
  return out;
}
