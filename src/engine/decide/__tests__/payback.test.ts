import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { SIMULATION_MONTH_CAP } from '../constants';
import { paybackMonths } from '../payback';
import { resolvePlanStrict } from '../plan';
import { resolveShare, SOLE_SHARE, type ResolvedShare } from '../share';
import type { PaymentStep, Plan, PurchaseIncomeChange } from '../types';
import { buyCash } from './helpers/fixtures';

const m = minorUnits;
const ASOF = '2026-07-10';

function plan(dayOne: number, steps: readonly PaymentStep[]): Plan {
  return { ...resolvePlanStrict(buyCash(dayOne)), dayOne: m(dayOne), paymentSteps: steps };
}

function gain(monthlyAmount: number, startDate = '2026-08-01'): PurchaseIncomeChange {
  return { monthlyAmount: m(monthlyAmount), startDate, likelihood: 'likely' } as PurchaseIncomeChange;
}

function input(
  p: Plan,
  runningNet: number,
  change: PurchaseIncomeChange,
  over: { share?: ResolvedShare; horizonMonths?: number; asOf?: string } = {}
) {
  return {
    asOf: over.asOf ?? ASOF,
    plan: p,
    runningNet: m(runningNet),
    share: over.share ?? SOLE_SHARE,
    change,
    horizonMonths: over.horizonMonths ?? SIMULATION_MONTH_CAP,
  };
}

describe('paybackMonths', () => {
  it('a cash purchase pays back when cumulative income passes day-one cost plus running costs', () => {
    expect(paybackMonths(input(plan(1_200_000, []), 30_000, gain(400_000)))).toEqual({
      months: 4,
      totalCost: 1_320_000,
      extraIncome: 1_600_000,
      horizonMonths: 600,
    });
  });

  it('counts income only from its start month', () => {
    const r = paybackMonths(input(plan(1_200_000, []), 30_000, gain(400_000, '2026-10-15')));
    expect(r.months).toBe(6);
    expect(r.totalCost).toBe(1_380_000);
    expect(r.extraIncome).toBe(1_600_000);
  });

  it('counts loan payments to date, including the residual last payment', () => {
    const steps: PaymentStep[] = [
      { fromMonth: 1, toMonth: 47, amount: m(28_000) },
      { fromMonth: 48, toMonth: 48, amount: m(28_020) },
    ];
    const r = paybackMonths(input(plan(300_000, steps), 30_000, gain(100_000)));
    expect(r.months).toBe(8);
    expect(r.totalCost).toBe(764_000);
    expect(r.extraIncome).toBe(800_000);
  });

  it('reports the figures at the horizon when it never pays back', () => {
    const r = paybackMonths(input(plan(1_200_000, []), 30_000, gain(20_000), { horizonMonths: 24 }));
    expect(r).toEqual({ months: null, totalCost: 1_200_000 + 30_000 * 24, extraIncome: 20_000 * 24, horizonMonths: 24 });
  });

  it('stops adding payments once they end', () => {
    const r = paybackMonths(input(plan(0, [{ fromMonth: 1, toMonth: 12, amount: m(100_000) }]), 0, gain(60_000)));
    expect(r.months).toBe(20);
    expect(r.totalCost).toBe(1_200_000);
  });

  it('a negative running cost (a replaced expense) lowers the cost', () => {
    const r = paybackMonths(input(plan(300_000, []), -50_000, gain(100_000)));
    // cost(k) = 300_000 - 50_000k; income 100_000k: k = 2 (200_000 vs 200_000)
    expect(r.months).toBe(2);
    expect(r.totalCost).toBe(200_000);
  });

  it('household: every cost term is my share and the income is mine', () => {
    const s = resolveShare({ kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } });
    if (!s.ok) throw new Error('share');
    const r = paybackMonths(input(plan(1_200_000, []), 30_000, gain(400_000), { share: s.share }));
    expect(r.months).toBe(2);
    expect(r.totalCost).toBe(630_000);
    expect(r.extraIncome).toBe(800_000);
  });

  it('a horizon of 24 caps the search', () => {
    expect(paybackMonths(input(plan(100_000_000, []), 0, gain(100_000), { horizonMonths: 24 })).months).toBeNull();
  });

  it('rejects a non-positive gain, a bad horizon and bad dates', () => {
    const p = plan(100_000, []);
    expect(() => paybackMonths(input(p, 0, gain(0)))).toThrow(/^paybackMonths: /);
    expect(() => paybackMonths(input(p, 0, gain(-5)))).toThrow(RangeError);
    for (const horizonMonths of [0, 1.5, SIMULATION_MONTH_CAP + 1]) {
      expect(() => paybackMonths(input(p, 0, gain(10), { horizonMonths }))).toThrow(/^paybackMonths: /);
    }
    expect(() => paybackMonths(input(p, 0, gain(10, 'soon')))).toThrow(/^paybackMonths: /);
    expect(() => paybackMonths(input(p, 0, gain(10), { asOf: 'nope' }))).toThrow(/^paybackMonths: /);
  });

  it('property: a larger monthly gain never lengthens the payback', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: -20_000, max: 100_000 }),
        fc.integer({ min: 1, max: 500_000 }),
        fc.integer({ min: 1, max: 500_000 }),
        (dayOne, running, g, extra) => {
          const p = plan(dayOne, []);
          const small = paybackMonths({ ...input(p, running, gain(g)), horizonMonths: 60 });
          const large = paybackMonths({ ...input(p, running, gain(g + extra)), horizonMonths: 60 });
          if (large.months === null) return small.months === null;
          return small.months === null || large.months <= small.months;
        }
      )
    );
  });
});
