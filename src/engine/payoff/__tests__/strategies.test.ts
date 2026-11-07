import fc from 'fast-check';
import golden from './golden/calc-grow.json';
import { strategy, type PlanDebt } from '../strategies';
import { ZERO_PERCENT, percent } from '../types';
import { minorUnits, type MinorUnits } from '../../money/types';

const m = minorUnits;
const card: PlanDebt = { id: 'card', balance: m(420_000), apr: percent('21.9'), minimum: m(12_000) };
const loan: PlanDebt = { id: 'loan', balance: m(150_000), apr: percent('9.5'), minimum: m(7_500) };
const both = [card, loan];
const doneOf = (r: ReturnType<typeof strategy>, id: string) => r.debts.find((d) => d.id === id)?.doneMonth;

describe('strategy', () => {
  it('extra 10000, Highest rate first', () => {
    const r = strategy(both, m(10_000), 'rate');
    expect(r.outcome).toBe('cleared');
    expect(r.months).toBe(24);
    expect(r.totalInterest).toBe(114_868);
    expect(r.budget).toBe(29_500);
    expect(doneOf(r, 'loan')).toBe(22);
    expect(golden.rate.totalInt).toBe(114_868);
    expect(r.debts.map((d) => d.interest)).toEqual(golden.rate.debts.map((d) => d.int));
  });

  it('extra 10000, Smallest balance first', () => {
    const r = strategy(both, m(10_000), 'balance');
    expect(r.months).toBe(24);
    expect(r.totalInterest).toBe(128_030);
    expect(doneOf(r, 'loan')).toBe(9);
    expect(golden.balance.totalInt).toBe(128_030);
    expect(golden.balance.debts[1]?.done).toBe(9);
  });

  it('minimums only', () => {
    const r = strategy(both, m(0), 'rate');
    expect(r.months).toBe(41);
    expect(r.totalInterest).toBe(218_434);
    expect(r.budget).toBe(19_500);
    expect(doneOf(r, 'loan')).toBe(22);
    expect(golden.minOnly.totalInt).toBe(218_434);
  });

  it('balance order uses the original balance, rate order the highest APR, ties by input order', () => {
    const a: PlanDebt = { id: 'a', balance: m(100_000), apr: percent('10'), minimum: m(1_000) };
    const b: PlanDebt = { id: 'b', balance: m(100_000), apr: percent('10'), minimum: m(1_000) };
    const r1 = strategy([a, b], m(50_000), 'rate');
    expect(doneOf(r1, 'a') as number).toBeLessThanOrEqual(doneOf(r1, 'b') as number);
    const r2 = strategy([b, a], m(50_000), 'balance');
    expect(doneOf(r2, 'b') as number).toBeLessThanOrEqual(doneOf(r2, 'a') as number);
  });

  it('one debt: both orders are deep-equal', () => {
    expect(strategy([card], m(10_000), 'rate')).toEqual(strategy([card], m(10_000), 'balance'));
  });

  it('a budget that cannot beat the interest never clears', () => {
    const r = strategy([{ ...card, minimum: m(5_000) }], m(0), 'rate');
    expect(r.outcome).toBe('never_clears');
    expect(r.totalInterest).toBeNull();
    expect(r.debts[0]?.doneMonth).toBeNull();
  });

  it('no debts and no budget is cleared at once', () => {
    const r = strategy([], m(0), 'rate');
    expect(r).toEqual({ outcome: 'cleared', months: 0, totalInterest: 0, budget: 0, debts: [] });
  });

  it('zero-balance debts are skipped and zero-rate debts are allowed', () => {
    const empty: PlanDebt = { id: 'empty', balance: m(0), apr: percent('5'), minimum: m(1_000) };
    const free: PlanDebt = { id: 'free', balance: m(10_000), apr: ZERO_PERCENT, minimum: m(5_000) };
    const r = strategy([empty, free], m(0), 'rate');
    expect(doneOf(r, 'empty')).toBe(0);
    expect(doneOf(r, 'free')).toBe(2);
    expect(r.totalInterest).toBe(0);
    expect(r.months).toBe(2);
  });

  it('a barely sufficient budget reaches the 600-month cap', () => {
    const big: PlanDebt = { id: 'big', balance: m(1_000_000), apr: percent('12'), minimum: m(10_001) };
    const r = strategy([big], m(0), 'rate');
    expect(r.outcome).toBe('exceeds_month_cap');
    expect(r.months).toBe(600);
    expect(r.totalInterest).not.toBeNull();
  });

  it.each([
    ['balance', () => strategy([{ ...card, balance: -1 as MinorUnits }], m(0), 'rate')],
    ['minimum', () => strategy([{ ...card, minimum: -1 as MinorUnits }], m(0), 'rate')],
    ['extra', () => strategy(both, -1 as MinorUnits, 'rate')],
  ])('negative %s throws', (_n, fn) => {
    expect(fn).toThrow(RangeError);
    expect(fn).toThrow(/^strategy: /);
  });

  describe('properties', () => {
    const debtArb = fc.record({
      balance: fc.integer({ min: 0, max: 2_000_000 }),
      apr: fc.integer({ min: 0, max: 3_000 }),
      minimum: fc.integer({ min: 0, max: 100_000 }),
    });
    const listArb = fc.array(debtArb, { minLength: 1, maxLength: 4 });
    const toPlan = (l: Array<{ balance: number; apr: number; minimum: number }>): PlanDebt[] =>
      l.map((d, i) => ({
        id: `d${i}`,
        balance: m(d.balance),
        apr: percent((d.apr / 100).toFixed(2)),
        minimum: m(d.minimum),
      }));

    it('interest >= 0, months <= 600, budget constant, safe integers', () => {
      fc.assert(
        fc.property(
          listArb,
          fc.integer({ min: 0, max: 100_000 }),
          fc.constantFrom('rate' as const, 'balance' as const),
          (l, extra, order) => {
            const r = strategy(toPlan(l), m(extra), order);
            expect(r.budget).toBe(l.reduce((s, d) => s + d.minimum, 0) + extra);
            expect(r.months).toBeLessThanOrEqual(600);
            if (r.totalInterest !== null) {
              expect(r.totalInterest).toBeGreaterThanOrEqual(0);
              expect(Number.isSafeInteger(r.totalInterest)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('for one debt both orders are equal', () => {
      fc.assert(
        fc.property(debtArb, fc.integer({ min: 0, max: 100_000 }), (d, extra) => {
          const plan = toPlan([d]);
          expect(strategy(plan, m(extra), 'rate')).toEqual(strategy(plan, m(extra), 'balance'));
        }),
        { numRuns: 100 }
      );
    });
  });
});
