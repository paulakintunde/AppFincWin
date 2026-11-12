/**
 * 05.4 D-68: a short plan paid from money on hand. Pure; integer minor units; engine-only imports.
 *
 * D-68 (owner, 2026-11-03; from the 05.4-52 review, gen:131): "a plan whose payments all fall inside the 90-day window, and which
 * the 90-day cash path can pay without going below $0 and without the locked safety net, is judged by cash like a one-off
 * purchase, not by the monthly 'Short each month' test. The answer carries one declarative caution line saying the monthly cost is
 * more than the usual month can cover, so it is paid from money on hand. This supersedes QE-12 only for plans that fit this rule.
 * Cases it moves come back to the owner. (Owner: 'both would work, judge by cash better by a slim margin, with caution'.)"
 *
 * D-68 refinements (owner, 2026-11-03, popup before plan 53): "(a) if the usual month is already short, a plan judged by cash gets
 * the same D-65 tier a cash buy of the same total would get (Small / Moderate / Large), not an automatic 'No'; (b) money on hand
 * must cover the plan's whole cost the way a cash buy would (matches BR-12), with no help from pay beyond what the 90-day path
 * already counts; (c) D-68 stays narrow: it changes an answer only when the monthly test fails, and never applies when the plan
 * needs the overdraft, any safety-net money (locked or not), or has a running cost."
 *
 * So D-68 applies only when ALL of these hold:
 *  1. the purchase is a plan with no running monthly cost;
 *  2. every payment the person chose (the count, not the rounded last paying period) is dated before asOf + 90 days (the same
 *     days 0..89 the cash path reads);
 *  3. the monthly part does not fit (monthly_short, or not_yet for a lean-month earner) and the usual month is known;
 *  4. the one-off ladder, run for the plan's whole cost (my share: deposit, fees and every payment once, the interest line's
 *     total), is a cash fit: fits_month or fits_unspent. The cash check inside it is the prepared 90-day path (JudgeInput.cash,
 *     every payment on its own date); oneOffPart reads it and never rebuilds a path from the price. So a fit needs the path to
 *     stay at or above 0 without the overdraft and without net money (cash kind 'ok'), and this month's room, spare money and
 *     extra savings above the net's size to cover the whole cost, as a one-off purchase of it would (refinement b, BR-12: "judged
 *     like paying £900 at once"). fits_uses_overdraft, fits_uses_net, not_yet and needs_input never qualify; an unlocked net's
 *     money up to its size is not used either, because the net up to its size is protected (D-56, refinement c).
 */
import type { MinorUnits } from '../../../money/types';
import { CASH_PATH_DAYS_V3 } from '../constants';
import { addDays } from '../dates';
import { planTotal } from '../depletion';
import { chosenPaymentsBefore } from '../plan/schedule';
import type { Code, Funds, MonthModel, Purchase, V3Inputs } from '../types';
import { firstPaymentsToday } from './purchase';

/**
 * What D-68 reads of the judge's input. Structural, so this module does not import judge.ts (judge.ts calls it; no cycle), and
 * judge.ts passes its own oneOffPart in.
 */
export interface ShortPlanJudge {
  readonly inputs: Pick<V3Inputs, 'asOf'>;
  readonly month: Pick<MonthModel, 'typicalLeft'>;
  readonly funds: Pick<Funds, 'ownEnvelope'>;
  readonly purchase: Purchase | null;
}

export type OneOffOf<J, O> = (j: J, available: { readonly unspent: MinorUnits | null; readonly envelope: MinorUnits }) => O;

export interface ShortPlanCash<O> {
  /** The plan's whole cost, my share: what the one-off ladder was run for. */
  readonly total: MinorUnits;
  /** The one-off part for that whole cost: fits_month or fits_unspent. */
  readonly one: O;
}

/**
 * D-68: the whole-cost cash reading of a short plan, or null when D-68 does not apply (the answer is judged as before). `oneOff` is
 * judge.ts's oneOffPart: the same ladder and the same prepared cash check a one-off purchase gets.
 */
export function shortPlanByCash<J extends ShortPlanJudge, O extends { readonly code: Code }>(
  j: J,
  p: Purchase,
  mon: { readonly code: Code } | null,
  unspent: MinorUnits | null,
  oneOff: OneOffOf<J, O>
): ShortPlanCash<O> | null {
  const s = p.schedule;
  if (s === null || p.runningMonthly !== 0) return null;
  if (mon === null || (mon.code !== 'monthly_short' && mon.code !== 'not_yet') || j.month.typicalLeft === null) return null;
  const asOf = j.inputs.asOf;
  if (!chosenPaymentsBefore(s, addDays(asOf, CASH_PATH_DAYS_V3))) return null;
  const total = planTotal(p.dayOne, s, p.share, firstPaymentsToday(s, p.share, asOf));
  const one = oneOff({ ...j, purchase: { ...p, dayOne: total } }, { unspent, envelope: j.funds.ownEnvelope });
  return one.code === 'fits_month' || one.code === 'fits_unspent' ? { total, one } : null;
}
