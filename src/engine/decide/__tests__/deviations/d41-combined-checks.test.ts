/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-41; engine depth expansion).
 *
 * New behaviour with no prototype counterpart: the prototype judged each purchase on its own, so two checks that were
 * each fine could together break the month or the cushion. D-41 judges a check on the combined position (every other
 * open check stacked first) and reports the standalone verdict beside it.
 */
import fc from 'fast-check';
import { minorUnits } from '../../../money/types';
import { ZERO_PERCENT, percent } from '../../../payoff/types';
import { assess } from '../../assess';
import { affordablePrice } from '../../bisect';
import { decide } from '../../decision';
import { buildOptions } from '../../options';
import type { Assessment, BuyCheck, DebtRecord, DecideLimits, DecideSnapshot, Verdict } from '../../types';
import { USD, buyCash, income, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

const D1: DebtRecord = {
  id: 'd1',
  balance: m(800_000),
  minimumPayment: m(20_000),
  secured: false,
  apr: percent('19.9'),
  currency: USD,
};
const D2: DebtRecord = {
  id: 'd2',
  balance: m(15_000_000),
  minimumPayment: m(90_000),
  secured: true,
  apr: percent('5.1'),
  currency: USD,
};
const LIMITS: DecideLimits = {
  reserve: m(600_000),
  dsrLine: percent('36'),
  housingLine: null,
  unsecuredIncomeMultiple: 12,
  investingFloor: m(40_000),
  savingFloor: m(25_000),
  spareFloor: null,
};
const BL = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  snapshotOf({ debts: [D1, D2], monthlySaving: m(25_000), monthlyInvesting: m(40_000), limits: LIMITS, ...over });
const PAY = income({
  seriesId: 'pay',
  freq: 'monthly',
  anchorDate: '2026-01-25',
  lastPaidDate: '2026-06-25',
  latestAmount: 600_000,
});
const other = (check: BuyCheck) => ({ check, purchaseRule: null });
const asAssessment = (v: Verdict): Assessment => {
  if (v.state === 'missing') throw new Error('expected a resolved verdict');
  return v;
};
const rank = (s: string): number => (s === 'fits' ? 0 : s === 'adjust' ? 1 : 2);

describe('D-41 combined checks', () => {
  const sofa = buyCash(100_000);
  const car = buyCash(1_800_000);

  it('D-41: other open checks are stacked before this one, and the standalone verdict is reported beside the combined one', () => {
    const d = decide(BL(), sofa, [other(car)]);
    expect(d.verdict.state).toBe('adjust');
    expect(d.standalone!.state).toBe('fits');
    expect(d.combinedDiffers).toBe(true);
  });

  it('D-41 amended: every open check sees all the others, whatever their creation order', () => {
    const bike = buyCash(50_000);
    const carSeesSofa = decide(BL(), car, [other(sofa)]);
    const sofaSeesCar = decide(BL(), sofa, [other(car)]);
    expect(carSeesSofa.stacked).toHaveLength(1);
    expect(sofaSeesCar.stacked).toHaveLength(1);
    // the totals are sums, so the order only shows in the stacked record's indexes
    const ab = asAssessment(decide(BL(), sofa, [other(car), other(bike)]).verdict);
    const ba = asAssessment(decide(BL(), sofa, [other(bike), other(car)]).verdict);
    const figures = (a: Assessment) => [a.state, a.warnings, a.left, a.cashAfter, a.debtServiceAfter, a.unsecuredAfter];
    expect(figures(ab)).toEqual(figures(ba));
  });

  it('D-41: bisection and options run on the combined position', () => {
    const d = decide(BL(), sofa, [other(car)]);
    const combined = asAssessment(d.verdict);
    const standalone = asAssessment(d.standalone!);
    const pc = affordablePrice(combined.context, sofa);
    const ps = affordablePrice(standalone.context, sofa);
    const price = (p: typeof pc): number => (p.kind === 'nothing_affordable' ? 0 : p.price);
    expect(price(pc)).toBeLessThanOrEqual(price(ps));
    expect(standalone.state).toBe('fits');
    expect(buildOptions(combined.context, sofa, combined).length).toBeGreaterThan(0);
  });

  it('D-41: the cash dip counts only this purchase, not the day-one costs of stacked checks', () => {
    // With the raw snapshot.cashOnHand the purchase-caused cash-card part would read max(0, min(600_000, 1_000_000) -
    // 500_000) = 100_000 and wrongly absorb the whole dip; with cashAvailable it is max(0, min(600_000, 500_000) -
    // 500_000) = 0, so the dip is a cash_dip warning.
    const snap = BL({ incomeSeries: [PAY], cashOnHand: m(1_000_000) });
    const loan = buyCash(2_785_644, {
      payment: { method: 'loan', deposit: m(0), termMonths: 12, apr: ZERO_PERCENT },
    });
    const d = decide(snap, loan, [other(buyCash(500_000))]);
    const v = asAssessment(d.verdict);
    expect(v.context.cashAvailable).toBe(500_000);
    expect(v.context.snapshot.cashOnHand).toBe(1_000_000);
    expect(v.cashAfter).toBe(500_000);
    if (v.cashPath.status !== 'available') throw new Error('expected a path');
    expect(v.cashPath.lowestWithout).toEqual({ day: 14, date: '2026-07-24', amount: 297_808 });
    expect(v.cashPath.lowestWith).toEqual({ day: 76, date: '2026-09-24', amount: 197_808 });
    expect(v.warnings).toContainEqual({ code: 'cash_dip', shortfall: 100_000 });
    expect(v.cashDip).toBe('soft');
    expect(v.facts).toContainEqual(
      expect.objectContaining({ code: 'cash_tight_before_payday', date: '2026-07-24', amount: 297_808 })
    );
    expect(d.margins.find((x) => x.line === 'cash_path')).toMatchObject({ margin: -100_000, flag: null });

    const alone = asAssessment(assess(snap, loan));
    if (alone.cashPath.status !== 'available') throw new Error('expected a path');
    expect(alone.cashPath.lowestWithout.amount).toBe(797_808);
    expect(alone.cashPath.lowestWith.amount).toBe(697_808);
    expect(alone.warnings.some((w) => w.code === 'cash_dip')).toBe(false);
  });

  it('D-41: the combined verdict is never better than the standalone one', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 3_000_000 }), { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 1, max: 2_000_000 }),
        (prices, price) => {
          const d = decide(
            BL(),
            buyCash(price),
            prices.map((p) => other(buyCash(p)))
          );
          expect(rank(d.verdict.state)).toBeGreaterThanOrEqual(rank(d.standalone!.state));
        }
      ),
      { numRuns: 100 }
    );
  });
});
