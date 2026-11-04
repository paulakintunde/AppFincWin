/**
 * I-D68 (05.4 D-68, owner 2026-11-03): "a plan whose payments all fall inside the 90-day window, and which the 90-day cash path can
 * pay without going below $0 and without the locked safety net, is judged by cash like a one-off purchase ... (Owner: 'both would
 * work, judge by cash better by a slim margin, with caution')". Refinements: an already-short month gets the D-65 tier of a cash buy
 * of the same total; money on hand covers the whole cost (BR-12); never with the overdraft, any safety-net money or a running cost.
 *
 * Over the invariant people plus short plans (3..6 payments, monthly or every 2 weeks, first payment today or one period out):
 * - with short_plan_from_cash: a plan with no running cost, every payment inside the 90 days, the monthly part not a fit, a cash fit
 *   (fits_month / fits_unspent) with no ready-by date, no net or overdraft line, a cash path that never goes below 0 (it already
 *   counts the money above the net's size), and no plan_makes_short or depletion_payment;
 * - without it: the pre-D-68 rule, the stricter of the two parts;
 * - one more payment of the same amount, past day 90, never adds it;
 * - less money in the everyday account never gives a better answer through it.
 */
import * as fc from 'fast-check';
import { percent } from '../../../../payoff/types';
import { CASH_PATH_DAYS_V3 } from '../../constants';
import { addDays } from '../../dates';
import { evaluate } from '../../evaluate';
import { paymentDates } from '../../plan/schedule';
import type { CheckV2, Code, PayV2, Result, V3Inputs } from '../../types';
import { fcRuns, isFullRun } from '../helpers/fcRuns';
import { checkPlan } from '../helpers/fixtures';
import { codeRank, inputsArb, withOverdraft } from './arbitraries';

const SEED = 0x5468;

interface ShortPlan {
  readonly payment: number;
  readonly count: number;
  readonly fortnight: boolean;
  readonly today: boolean;
  readonly apr: number;
}

const shortPlanArb: fc.Arbitrary<ShortPlan> = fc.record({
  payment: fc.integer({ min: 2_000, max: 400_000 }),
  count: fc.integer({ min: 3, max: 6 }),
  fortnight: fc.boolean(),
  today: fc.boolean(),
  apr: fc.constantFrom(0, 0, 0, 9, 24),
});

function checkOf(s: ShortPlan, count = s.count, apr = s.apr): CheckV2 {
  const pay: Partial<Extract<PayV2, { mode: 'plan' }>> = {
    cadence: s.fortnight ? { unit: 'week', every: 2 } : { unit: 'month', every: 1 },
    count,
    apr: percent(String(apr)),
    firstPayment: s.today ? { kind: 'today' } : { kind: 'one_period' },
  };
  return checkPlan(s.payment * count, pay);
}

const has = (r: Result, code: string): boolean => r.facts.some((f) => f.code === code);
const D68 = 'short_plan_from_cash';

function stricter(a: Code, b: Code | null): Code {
  return b === null || codeRank(a) <= codeRank(b) ? a : b;
}

const FITS: readonly Code[] = ['fits_month', 'fits_unspent', 'fits_uses_net', 'fits_uses_overdraft'];

/** 05.4-22 (FIN-05): an expensive plan that fits is fits_by_borrowing; the parts still say it fits (the borrowing rule only tightens). */
function asJudged(r: Result): Code {
  if (r.code !== 'fits_by_borrowing') return r.code;
  // a D-68 plan is judged by cash: its code is the one-off part's
  const own = has(r, D68) ? r.parts.oneOff : stricter(r.parts.oneOff, r.parts.monthly);
  return FITS.includes(own) ? own : r.code;
}

/** The everyday account and the unspent anchor lowered together, no overdraft (withOverdraft with no limit). */
const lowered = (i: V3Inputs, drop: number): V3Inputs => withOverdraft(i, { overdraftLimit: null, overdraftRate: null, balanceDrop: drop });

describe('I-D68 a short plan paid from money on hand is judged by cash, and nothing else moves', () => {
  it('I-D68 with the caution line: inside the window, no running cost, a cash fit on a path that stays at or above 0', () => {
    let seen = 0;
    fc.assert(
      fc.property(inputsArb, shortPlanArb, (inputs, s) => {
        const ev = evaluate(inputs, checkOf(s));
        const r = ev.result;
        if (!has(r, D68)) {
          if (r.code !== 'needs_input') expect(asJudged(r)).toBe(stricter(r.parts.oneOff, r.parts.monthly));
          return;
        }
        seen += 1;
        expect(r.facts.filter((f) => f.code === D68)).toHaveLength(1);
        const p = ev.purchase;
        expect(p).not.toBeNull();
        if (p === null || p.schedule === null) throw new RangeError('a D-68 answer is a plan');
        expect(p.runningMonthly).toBe(0);
        const end = addDays(inputs.asOf, CASH_PATH_DAYS_V3);
        for (const d of paymentDates(p.schedule)) expect(d < end).toBe(true);
        expect(['monthly_short', 'not_yet']).toContain(r.parts.monthly);
        expect(['fits_month', 'fits_unspent']).toContain(asJudged(r));
        expect(r.parts.oneOff).toBe(asJudged(r));
        expect(r.readyBy).toBeNull();
        for (const c of ['net_used', 'overdraft_use', 'plan_makes_short', 'depletion_payment']) expect(has(r, c)).toBe(false);
        expect(r.split.some((x) => x.source === 'emergency')).toBe(false);
        expect(ev.cash.kind).toBe('ok');
        if (ev.cash.kind === 'ok') expect(ev.cash.lowest.balance).toBeGreaterThanOrEqual(0);
        expect(r.facts.find((f) => f.code === D68)?.values).toEqual({ monthly: p.monthly });
      }),
      { numRuns: fcRuns(400), seed: SEED }
    );
    // The arbitraries reach D-68 at all (else the checks above say nothing). Only on a full run: Stryker and
    // FC_RUNS=10 draw too few people to reach it; shortPlan.test.ts pins D-68 answers by hand either way.
    if (isFullRun(400)) expect(seen).toBeGreaterThan(0);
  });

  it('I-D68 one more payment of the same amount, past day 90, never adds the caution line', () => {
    fc.assert(
      fc.property(inputsArb, shortPlanArb, (inputs, s) => {
        const base = evaluate(inputs, checkOf(s, s.count, 0));
        let n = s.count + 1;
        let more = evaluate(inputs, checkOf(s, n, 0));
        // grow until the last payment is past day 90
        const end = addDays(inputs.asOf, CASH_PATH_DAYS_V3);
        while (more.purchase?.schedule != null && paymentDates(more.purchase.schedule).every((d) => d < end)) {
          n += 1;
          more = evaluate(inputs, checkOf(s, n, 0));
        }
        expect(has(more.result, D68)).toBe(false);
        if (!has(base.result, D68)) expect(has(evaluate(inputs, checkOf(s, s.count + 1, 0)).result, D68)).toBe(false);
      }),
      { numRuns: fcRuns(200), seed: SEED + 1 }
    );
  });

  it('I-D68 less money in the everyday account never gives a better answer through the caution line', () => {
    fc.assert(
      fc.property(inputsArb, shortPlanArb, fc.integer({ min: 1, max: 3_000_000 }), (inputs, s, drop) => {
        const check = checkOf(s);
        const more = evaluate(lowered(inputs, 0), check).result;
        const less = evaluate(lowered(inputs, drop), check).result;
        if (has(less, D68) && !has(more, D68)) expect(codeRank(less.code)).toBeLessThanOrEqual(codeRank(more.code));
        if (has(less, D68)) expect(codeRank(less.code)).toBeLessThanOrEqual(codeRank(more.code));
      }),
      { numRuns: fcRuns(200), seed: SEED + 2 }
    );
  });
});
