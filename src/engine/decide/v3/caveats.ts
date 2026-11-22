/**
 * 05.4 D-64 (4), (5), D-118, D-119 (05.4-37): the contextual caveats. Pure: it reads the finished answer, the month model, the
 * purchase and the inputs, and never changes any of them (I75). The screen shows the first caveat under the answer, plus
 * large_for_month's figures; the About sheet lists them all (08.1).
 */
import { myPart } from '../share';
import { CONFIDENCE_MIN_MONTHS, RECORDS_FRESH_SYNC_DAYS } from './constants';
import { daysBetween, isValidLocalDate } from './dates';
import type { MinorUnits } from '../../money/types';
import type { Caveat, CaveatCode, CheckV2, MonthModel, Purchase, Result, V3Inputs } from './types';

/** D-119: after large_for_month, most likely to make the answer wrong first. */
export const CAVEAT_ORDER: readonly CaveatCode[] = Object.freeze([
  'large_for_month',
  'your_word',
  'quick_estimates',
  'records_out_of_date',
  'no_debts_recorded',
  'few_months',
  'irregular_income',
  'close_to_line',
  'expected_bills',
  'household_not_shared',
  'shared_money',
  'share_zero_by_rule',
  'rate_estimated',
  'tax_not_included',
  'long_plan',
]);

/** A plan longer than this many months carries long_plan (research 6c). */
export const LONG_PLAN_MONTHS = 12;

export interface CaveatSource {
  readonly result: Result;
  readonly month: MonthModel;
  readonly purchase: Purchase | null;
}

/** Months a plan's payments run: count x every for a monthly cadence; weeks read as 84/365 of a month each, rounded up. */
export function planMonths(p: Purchase): number | null {
  const s = p.schedule;
  if (s === null) return null;
  const periods = s.count * s.cadence.every;
  return s.cadence.unit === 'month' ? periods : Math.ceil((periods * 84) / 365);
}

/** D-118: the price with tax and fees, and for a plan its interest too (my share). */
function wholeCost(p: Purchase): MinorUnits {
  const interest = p.schedule === null ? 0 : myPart(p.schedule.totalInterest, p.share);
  return (p.whole + interest) as MinorUnits;
}

function largeForMonth(src: CaveatSource): Caveat | null {
  const p = src.purchase;
  if (p === null) return null;
  const price = wholeCost(p);
  const moneyIn = src.month.typicalIncome;
  if (price < moneyIn) return null;
  const used = src.result.split.filter((s) => s.source !== 'month' && s.source !== 'envelope').reduce((a, s) => a + s.amount, 0);
  const left = src.month.typicalLeft;
  return { code: 'large_for_month', values: { moneyIn, ...(left === null ? {} : { costs: moneyIn - left }), used, price } };
}

function recordsOutOfDate(inputs: V3Inputs): Caveat | null {
  const at = inputs.recordsAsOf ?? null;
  // Stryker disable next-line EqualityOperator,ConditionalExpression: a future or bad date gives a negative or NaN day count, never over the limit, so the result is null anyway
  if (at === null || !isValidLocalDate(at) || at > inputs.asOf) return null;
  return daysBetween(at, inputs.asOf) > RECORDS_FRESH_SYNC_DAYS ? { code: 'records_out_of_date', values: { date: at } } : null;
}

/** Every caveat the answer carries, no code twice, in CAVEAT_ORDER. [] on an ask or a not-ready answer. */
export function caveatsFor(src: CaveatSource, inputs: V3Inputs, check: CheckV2): readonly Caveat[] {
  const r = src.result;
  if (r.code === 'needs_input' || r.readiness?.ready === false) return [];
  const conf = new Set(r.confidence.reasons.map((x) => x.code));
  const facts = new Set(r.facts.map((f) => f.code));
  const reasons = new Set(r.reasons);
  const found: Caveat[] = [];
  const add = (code: CaveatCode, on: boolean): void => {
    if (on) found.push({ code, values: {} });
  };
  const large = largeForMonth(src);
  if (large !== null) found.push(large);
  add('your_word', conf.has('user_said_cover') || r.code === 'fits_on_your_answer');
  add('quick_estimates', conf.has('quick_estimates'));
  const stale = recordsOutOfDate(inputs);
  if (stale !== null) found.push(stale);
  add('no_debts_recorded', facts.has('ask_debts_not_recorded'));
  // few_months carries { used, lookedFor } (confidence/reasons.ts); with no month used at all the quick-estimates line says it.
  const few = r.confidence.reasons.find((x) => x.code === 'few_months');
  if (few !== undefined && Number(few.numbers['used']) >= 1) found.push({ code: 'few_months', values: { months: Number(few.numbers['used']), lookedFor: CONFIDENCE_MIN_MONTHS } });
  add('irregular_income', reasons.has('lean_months_used') || reasons.has('volatile_cover_declined') || r.notices.some((n) => n.code === 'income_volatile'));
  // The tight rule's floor fact is the answer sitting close to the line (FIN-07, D-40); the confidence reason is declared for it too.
  add('close_to_line', conf.has('close_to_line') || facts.has('tight_floor'));
  // 08.1-08 D-03: Household was asked for and some partner's money is not counted; the screen resolves the names (D-32).
  const notShared = inputs.household?.scope === 'household' ? inputs.household.notShared : [];
  if (notShared.length > 0) found.push({ code: 'household_not_shared', values: { names: notShared.join(',') } });
  // 08.1-08 UX-21 (owner 2026-11-20, either scope): money counted that sits in an account in both names. A joint account with no
  // money in it, or one no rate converts (it counts nowhere), is not "used".
  const joint = (inputs.accounts ?? []).find((a) => a.joint === true && a.noRate !== true && a.balance > 0);
  if (joint !== undefined) found.push({ code: 'shared_money', values: { account: joint.id } });
  // 08.1-25 (owner 2026-11-21, either scope): the viewer's share of the joint money is $0 because of the rule. A line only; the
  // screen offers equal shares and the group picks.
  const zero = inputs.household?.zeroShare;
  if (zero != null) found.push({ code: 'share_zero_by_rule', values: { rule: zero.rule } });
  add('rate_estimated', facts.has('implied_rate') || reasons.has('quote_used_no_rate'));
  add('tax_not_included', reasons.has('tax_not_included'));
  // Stryker disable next-line ConditionalExpression: a once check has no schedule, so planMonths gives null the same as the guard does
  const months = check.pay.mode === 'plan' && src.purchase !== null ? planMonths(src.purchase) : null;
  if (months !== null && months > LONG_PLAN_MONTHS) found.push({ code: 'long_plan', values: { months } });
  const rank = (c: Caveat): number => CAVEAT_ORDER.indexOf(c.code);
  // Stryker disable next-line MethodExpression,ArithmeticOperator: the caveats are pushed in CAVEAT_ORDER already, so the sort never moves one
  return found.sort((a, b) => rank(a) - rank(b));
}
