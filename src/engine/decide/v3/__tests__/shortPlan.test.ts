/**
 * 05.4 D-68 (owner, 2026-11-03): "a plan whose payments all fall inside the 90-day window, and which the 90-day cash path can pay
 * without going below $0 and without the locked safety net, is judged by cash like a one-off purchase". Refinements (owner popup
 * before plan 53): (a) an already-short usual month gets the D-65 tier a cash buy of the same total would get; (b) money on hand
 * covers the whole cost the way a cash buy would (BR-12); (c) narrow: only when the monthly test fails, never with the overdraft,
 * any safety-net money (locked or not) or a running cost.
 *
 * The people are in helpers/shortPlanFixtures.ts. Their hand figures (minor units):
 * - usual month 3,000 - 1,500 - 1,000 = 500 left; this month's room (monthLeft) 500; spare money = 4,000 balance - 500 still to
 *   spend this month = 3,500 (Evaluation.spare 350,000).
 * - "before D-68" is the same engine with shortPlanByCash mocked to "does not apply" (jest.isolateModules).
 */
import { minorUnits } from '../../../money/types';
import { evaluate } from '../evaluate';
import { shortPlanByCash, type ShortPlanJudge } from '../judge/shortPlan';
import type { CheckV2, Code, Purchase, Result, V3Inputs } from '../types';
import { SHORT_PLAN_CASES, shortPlan, type ShortPlanCase } from './helpers/shortPlanFixtures';

const codes = (r: Result) => r.facts.map((f) => f.code);
const fact = (r: Result, code: string) => r.facts.find((f) => f.code === code)?.values;
const run = (o: ShortPlanCase) => {
  const { inputs, check } = shortPlan(o);
  return evaluate(inputs, check);
};

/** The answer with D-68 switched off (shortPlanByCash always "does not apply"). */
function beforeD68(inputs: V3Inputs, check: CheckV2): Result {
  let out: Result | null = null;
  jest.isolateModules(() => {
    jest.doMock('../judge/shortPlan', () => ({ shortPlanByCash: () => null }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../evaluate') as typeof import('../evaluate');
    out = mod.evaluate(inputs, check).result;
  });
  jest.dontMock('../judge/shortPlan');
  return out as unknown as Result;
}

const unchanged = (o: ShortPlanCase) => {
  const { inputs, check } = shortPlan(o);
  const r = evaluate(inputs, check).result;
  expect(r).toEqual(beforeD68(inputs, check));
  expect(codes(r)).not.toContain('short_plan_from_cash');
  return r;
};

describe('D-68: a short plan paid from money on hand is judged by cash', () => {
  it('QUALIFIES: 3 x 600 from today (15 Nov, 15 Dec, 15 Jan) reads as a 1,800 cash fit with the caution line', () => {
    // Before: 600 > 500 a month, so Short each month (QE-12 rule).
    const { inputs, check } = shortPlan(SHORT_PLAN_CASES.qualifies);
    expect(beforeD68(inputs, check).code).toBe('monthly_short');
    const ev = evaluate(inputs, check);
    const r = ev.result;
    expect(ev.spare).toBe(350_000);
    // Whole cost 3 x 600 = 1,800. Ladder: this month's room 500, then 1,300 of the 3,000 earlier spare money (3,500 - 500).
    expect(r.code).toBe('fits_unspent');
    expect(r.variant).toBeNull();
    expect(r.split).toEqual([
      { source: 'month', amount: 50_000 },
      { source: 'unspent_earlier', amount: 130_000 },
    ]);
    expect(r.split.reduce((t, s) => t + s.amount, 0)).toBe(180_000);
    expect(r.facts[0]).toEqual({ code: 'short_plan_from_cash', values: { monthly: 60_000 } });
    expect(codes(r).filter((c) => c === 'short_plan_from_cash')).toHaveLength(1);
    expect(codes(r)).not.toContain('plan_makes_short');
    expect(codes(r)).not.toContain('depletion_payment');
    expect(r.parts).toEqual({ oneOff: 'fits_unspent', monthly: 'monthly_short' });
    expect(r.readyBy).toBeNull();
    // 500 - 500 this month = 0; spare 3,500 - 500 - 1,300 = 1,700
    expect(fact(r, 'month_left_after')).toEqual({ month: '2026-11', left: 0 });
    expect(fact(r, 'unspent_before_after')).toEqual({ before: 350_000, after: 170_000 });
    expect(codes(r)).not.toContain('move_money_by');
  });

  it('LONG: 6 x 300 (monthly part fits) and 6 x 600 (last 15 Apr, past day 90) read exactly as before', () => {
    expect(unchanged(SHORT_PLAN_CASES.longFits).code).toBe('fits_month');
    const r = unchanged(SHORT_PLAN_CASES.longShort);
    expect(r.code).toBe('monthly_short');
    expect(codes(r)).toContain('plan_makes_short');
  });

  it('PATH BELOW 0: Everyday 500 pays 600 today, so the path goes below 0 and the answer is as before', () => {
    expect(unchanged(SHORT_PLAN_CASES.pathBelow).code).toBe('not_yet');
  });

  it('LOCKED NET ONLY: 3 x 900 from Everyday 1,000 only the net could carry: Not yet with net_locked; unlocked, still no D-68', () => {
    const locked = unchanged(SHORT_PLAN_CASES.lockedNet);
    expect(locked.code).toBe('not_yet');
    expect(codes(locked)).toContain('net_locked');
    const open = unchanged(SHORT_PLAN_CASES.unlockedNet);
    expect(open.parts.oneOff).toBe('fits_uses_net');
    expect(open.code).toBe('monthly_short');
  });

  it('EXTRA SAVINGS: Everyday 500 and 4,000 above the net: Fits from extra savings, with the move-by line and the caution line', () => {
    const ev = run(SHORT_PLAN_CASES.extraSavings);
    const r = ev.result;
    // spare 500 - 500 still to spend = 0; extra savings 6,000 - 2,000 = 4,000. Ladder for 1,800: no room (D-86), all 1,800 of extra savings.
    expect(ev.spare).toBe(0);
    expect(ev.net?.aboveSize).toBe(400_000);
    expect(r.code).toBe('fits_unspent');
    expect(r.variant).toBe('extra_savings');
    // 05.4-24 FIN-09b (D-86): the everyday account opened the month $500 below $0 ($500 now after $3,000 in and $2,000 out), so
    // this month's $500 pays that back first and the whole $1,800 comes from the extra savings (BR-21)
    expect(r.split).toEqual([{ source: 'extra_savings', amount: 180_000 }]);
    expect(fact(r, 'extra_savings_used')).toEqual({ used: 180_000, above: 400_000 });
    // The Everyday account alone: 500 - 600 today is below 0, so money moves from savings today.
    expect(fact(r, 'move_money_by')).toEqual(expect.objectContaining({ date: '2026-11-15' }));
    expect(r.facts[0]).toEqual({ code: 'short_plan_from_cash', values: { monthly: 60_000 } });
    expect(codes(r)).not.toContain('plan_makes_short');
  });

  it('RUNNING COST: the qualifying plan with 20 a month of insurance reads as before (the cost runs past the window)', () => {
    expect(unchanged(SHORT_PLAN_CASES.running).code).toBe('monthly_short');
  });

  it('ALREADY SHORT (D-65): usual month 100 short, the 3 x 600 plan gets the tier a 1,800 cash buy gets (Moderate, 32 -> 14 months)', () => {
    // Usual month 3,000 - 1,600 - 1,500 = -100. Spare = 4,000 - 750 still to spend = 3,250. Room this month -100, so the ladder
    // takes all 1,800 from earlier spare money. R = 3,250, S = 100: N = floor(325,000 / 10,000) = 32; M = floor(145,000 / 10,000) = 14.
    const { inputs, check } = shortPlan(SHORT_PLAN_CASES.alreadyShort);
    const before = beforeD68(inputs, check);
    expect(before.variant).toBe('month_already_short');
    const ev = evaluate(inputs, check);
    const r = ev.result;
    expect(ev.spare).toBe(325_000);
    expect(r.code).toBe('fits_unspent');
    expect(r.variant).toBe('month_short_moderate');
    expect(r.split).toEqual([{ source: 'unspent_earlier', amount: 180_000 }]);
    expect(r.facts[0]).toEqual({ code: 'money_lasts_shorter', values: { months: 32, monthsAfter: 14 } });
    expect(r.facts[1]).toEqual({ code: 'short_plan_from_cash', values: { monthly: 60_000 } });
    expect(fact(r, 'usual_month_short')).toEqual({ short: 10_000 });
    expect(codes(r)).not.toContain('depletion_payment');
    expect(codes(r)).not.toContain('plan_makes_short');
    expect(codes(r)).toEqual(expect.arrayContaining(['balanced_month_room', 'month_balance_gap']));
    expect(r.readyBy).toBeNull();
  });

  it('FORTNIGHT: 4 x 450 every 2 weeks from today (15 Nov .. 27 Dec) applies, with the monthly equivalent 450 x 26 / 12 = 975', () => {
    const r = run(SHORT_PLAN_CASES.fortnight).result;
    expect(r.code).toBe('fits_unspent');
    expect(r.split.reduce((t, s) => t + s.amount, 0)).toBe(180_000);
    expect(r.facts[0]).toEqual({ code: 'short_plan_from_cash', values: { monthly: 97_500 } });
    expect(r.parts.monthly).toBe('monthly_short');
  });

  it('the day-90 edge: the path reads days 0..89 (15 Nov .. 12 Feb); a payment on 13 Feb is outside', () => {
    // 12 Dec, 12 Jan, 12 Feb: all inside. 13 Dec, 13 Jan, 13 Feb: the last is day 90, outside.
    expect(codes(run({ ...SHORT_PLAN_CASES.qualifies, firstOn: '2026-12-12' }).result)).toContain('short_plan_from_cash');
    expect(unchanged({ ...SHORT_PLAN_CASES.qualifies, firstOn: '2026-12-13' }).code).toBe('monthly_short');
    // One period out: 15 Dec, 15 Jan, 15 Feb (outside). Every 2 weeks one period out: 29 Nov .. 10 Jan (inside).
    expect(unchanged({ ...SHORT_PLAN_CASES.qualifies, first: 'one_period' }).code).toBe('monthly_short');
    expect(codes(run({ ...SHORT_PLAN_CASES.fortnight, first: 'one_period' }).result)).toContain('short_plan_from_cash');
  });

  it('whole cost not covered by money on hand (BR-12): 3 x 1,500 = 4,500 against 3,500 of spare money reads as before', () => {
    // The path may stay above 0 with pay coming in, but a cash buy of 4,500 is not covered by room 500 + earlier 3,000.
    expect(unchanged({ ...SHORT_PLAN_CASES.qualifies, price: 450_000 }).code).not.toBe('fits_unspent');
  });
});

describe('shortPlanByCash: each condition on its own (hand-built judge input, the ladder stubbed)', () => {
  const ev = run(SHORT_PLAN_CASES.qualifies);
  const p = ev.purchase as Purchase;
  const j: ShortPlanJudge = { inputs: { asOf: '2026-11-15' }, month: { typicalLeft: minorUnits(50_000) }, funds: { ownEnvelope: minorUnits(0) }, purchase: p };
  const short = { code: 'monthly_short' as Code };
  const fits = (code: Code) => jest.fn((_j: ShortPlanJudge, _a: unknown) => ({ code }));

  it('applies on monthly_short or not_yet with a cash fit, and runs the ladder for the whole cost 1,800 (not day one 600)', () => {
    expect(p.dayOne).toBe(60_000);
    for (const mon of [short, { code: 'not_yet' as Code }]) {
      for (const code of ['fits_month', 'fits_unspent'] as Code[]) {
        const oneOff = fits(code);
        expect(shortPlanByCash(j, p, mon, minorUnits(350_000), oneOff)).toEqual({ total: 180_000, one: { code } });
        expect(oneOff.mock.calls[0]?.[0].purchase?.dayOne).toBe(180_000);
        expect(oneOff.mock.calls[0]?.[1]).toEqual({ unspent: 350_000, envelope: 0 });
      }
    }
  });

  it('never applies on any other one-off code (overdraft, the net, not yet, an ask)', () => {
    for (const code of ['fits_uses_overdraft', 'fits_uses_net', 'not_yet', 'needs_input'] as Code[]) {
      expect(shortPlanByCash(j, p, short, minorUnits(350_000), fits(code))).toBeNull();
    }
  });

  it('never applies to a one-off, a running cost, a monthly part that fits or is missing, or an unknown usual month', () => {
    const oneOff = fits('fits_unspent');
    expect(shortPlanByCash(j, { ...p, schedule: null }, short, null, oneOff)).toBeNull();
    expect(shortPlanByCash(j, { ...p, runningMonthly: minorUnits(1) }, short, null, oneOff)).toBeNull();
    expect(shortPlanByCash(j, p, null, null, oneOff)).toBeNull();
    for (const code of ['fits_month', 'fits_unspent'] as Code[]) expect(shortPlanByCash(j, p, { code }, null, oneOff)).toBeNull();
    expect(shortPlanByCash({ ...j, month: { typicalLeft: null } }, p, short, null, oneOff)).toBeNull();
    expect(oneOff).not.toHaveBeenCalled();
  });

  it('never applies when a payment is on or after day 90 (2027-02-13)', () => {
    const oneOff = fits('fits_unspent');
    expect(shortPlanByCash({ ...j, inputs: { asOf: '2026-10-17' } }, p, short, null, oneOff)).toBeNull(); // 15 Jan is day 90 from 17 Oct
    expect(shortPlanByCash({ ...j, inputs: { asOf: '2026-10-18' } }, p, short, null, oneOff)).not.toBeNull(); // day 89
  });
});

describe('D-68 with interest: the interest line still shows, and its total is the whole cost the ladder covers', () => {
  it('3 payments at 20% APR from today: cash fit, interest_is_a_cost total = the split total', () => {
    const r = run({ ...SHORT_PLAN_CASES.qualifies, apr: '20' }).result;
    // 05.4-22 (FIN-05, D-07): 20% is expensive and paying the $1,800 in cash fits, so "Fits, but borrowing costs more"; the parts
    // still read the D-68 cash fit
    expect({ code: r.code, variant: r.variant, oneOff: r.parts.oneOff }).toEqual({ code: 'fits_by_borrowing', variant: 'borrowing_costs_more', oneOff: 'fits_unspent' });
    expect(r.facts[0]?.code).toBe('short_plan_from_cash');
    const interest = fact(r, 'interest_is_a_cost') as { interest: number; total: number };
    expect(interest.interest).toBeGreaterThan(0);
    expect(interest.total).toBe(180_000 + interest.interest);
    expect(r.split.reduce((t, s) => t + s.amount, 0)).toBe(interest.total);
  });
});
