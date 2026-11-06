/**
 * I59 and I60 (05.4-22: FIN-05 / ENG-08, D-07 as changed by D-39a and D-39c). Golden persons, perturbed (inputsArb).
 *
 * I59: for the same purchase, a higher APR or higher plan fees never gives a better (looser) code; on a price of $100 or more, never
 * less interest and (with no per-payment fee) never a lower total paid. On a tiny price a higher rate can round the level payment up
 * so the plan ends a payment or more early (05.1 schedule rule), and a per-payment fee is charged on each payment made: on a $1
 * price, $1.25 can fall to $1.20 and the interest by a cent.
 * I60: when cash fits (the same purchase paid once is fits_month or fits_unspent) and the plan is expensive (20% APR or more, or, not
 * for a home loan, interest of 10% or more of the amount borrowed), the plan answer is fits_by_borrowing with the variant
 * borrowing_costs_more, or stricter. The month-short headlines (D-63 / D-65) keep the lead as the variant, so only the code is read there.
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { PERCENT_SCALE, percentFromScaled } from '../../../../payoff/types';
import { CODE_PRECEDENCE } from '../../constants';
import { evaluate } from '../../evaluate';
import type { PayV2 } from '../../types';
import { checkOnce, checkPlan } from '../helpers/fixtures';
import { fcRuns } from '../helpers/fcRuns';
import { codeRank, inputsArb, planPayArb, priceArb } from './arbitraries';

type Plan = Partial<Extract<PayV2, { mode: 'plan' }>>;
const MONTH_SHORT = ['month_already_short', 'month_short_small', 'month_short_moderate', 'month_short_moderate_extra'];
const feeArb = fc.record({ setup: fc.integer({ min: 0, max: 20_000 }), perPeriod: fc.integer({ min: 0, max: 2_000 }), end: fc.integer({ min: 0, max: 20_000 }) });
const withFees = (plan: Plan, f: { setup: number; perPeriod: number; end: number }): Plan => ({
  ...plan,
  fees: { setup: minorUnits(f.setup), perPeriod: minorUnits(f.perPeriod), end: minorUnits(f.end) },
});

describe('borrowing', () => {
  it('I59 a dearer loan never looks better: a higher APR or higher fees never loosens the code or lowers the total paid', () => {
    let compared = 0;
    let borrowed = 0;
    fc.assert(
      fc.property(
        inputsArb,
        priceArb,
        planPayArb,
        fc.integer({ min: 0, max: 40 }),
        feeArb,
        feeArb,
        fc.boolean(),
        (inputs, price, plan, moreApr, fees, moreFees, housing) => {
          const base = withFees({ ...plan, housing }, fees);
          const apr = (plan.apr ?? percentFromScaled(0n)) + BigInt(moreApr) * PERCENT_SCALE;
          const dearer = withFees({ ...plan, housing, apr: percentFromScaled(apr) }, { setup: fees.setup + moreFees.setup, perPeriod: fees.perPeriod + moreFees.perPeriod, end: fees.end + moreFees.end });
          const a = evaluate(inputs, checkPlan(price, base));
          const b = evaluate(inputs, checkPlan(price, dearer));
          if (a.result.code === 'needs_input' || b.result.code === 'needs_input' || a.planCard === null || b.planCard === null) return;
          compared += 1;
          if (a.result.code === 'fits_by_borrowing' || b.result.code === 'fits_by_borrowing') borrowed += 1;
          expect({ a: a.result.code, b: b.result.code, ok: codeRank(b.result.code) <= codeRank(a.result.code) }).toEqual({ a: a.result.code, b: b.result.code, ok: true });
          // on a price of at least $100 the rounded-up payment cannot end the plan early (its extra cents stay under one payment)
          if (price >= 10_000) {
            expect(b.planCard.interest).toBeGreaterThanOrEqual(a.planCard.interest);
            if (fees.perPeriod + moreFees.perPeriod === 0) expect(b.planCard.total).toBeGreaterThanOrEqual(a.planCard.total);
          }
        }
      ),
      { numRuns: fcRuns(500), seed: 0x0559 }
    );
    expect(compared).toBeGreaterThan(0);
    expect(borrowed).toBeGreaterThan(0);
  });

  it('I60 cash fits and the plan is expensive: fits_by_borrowing (borrowing_costs_more) or stricter', () => {
    let hit = 0;
    fc.assert(
      fc.property(inputsArb, priceArb, planPayArb, fc.boolean(), (inputs, price, plan, housing) => {
        const cash = evaluate(inputs, checkOnce(price)).result;
        if (cash.code !== 'fits_month' && cash.code !== 'fits_unspent') return;
        const e = evaluate(inputs, checkPlan(price, { ...plan, housing }));
        const s = e.purchase?.schedule ?? null;
        if (s === null || s.financed <= 0) return;
        const aprBp = ((plan.apr ?? 0n) * 100n) / PERCENT_SCALE;
        const expensive = aprBp >= 2000n || (!housing && BigInt(s.totalInterest) * 10n >= BigInt(s.financed));
        if (!expensive) return;
        const r = e.result;
        hit += 1;
        expect({ code: r.code, ok: codeRank(r.code) <= CODE_PRECEDENCE.indexOf('fits_by_borrowing') }).toEqual({ code: r.code, ok: true });
        const short = r.variant !== null && MONTH_SHORT.includes(r.variant);
        if (r.code === 'fits_by_borrowing' && !short) expect(r.variant).toBe('borrowing_costs_more');
        expect(r.facts.some((f) => f.code === 'save_vs_borrow')).toBe(r.code !== 'needs_input');
      }),
      { numRuns: fcRuns(600), seed: 0x0560 }
    );
    expect(hit).toBeGreaterThan(0);
  });
});
