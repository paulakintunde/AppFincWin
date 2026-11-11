import fc from 'fast-check';
import golden from './golden/calc-grow.json';
import { fixedPayoff } from '../fixedPayoff';
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
    expect(r.budget).toBe(5_000);
  });

  it('P2-WR-08: a debt already at $0 adds nothing to the budget', () => {
    // A owes $1,000 with a $50 minimum; B owes $0 with a $200 minimum still recorded: the budget is the $50 really paid
    const a: PlanDebt = { id: 'a', balance: m(100_000), apr: ZERO_PERCENT, minimum: m(5_000) };
    const b: PlanDebt = { id: 'b', balance: m(0), apr: ZERO_PERCENT, minimum: m(20_000) };
    const r = strategy([a, b], m(0), 'rate');
    expect(r.budget).toBe(5_000);
    expect(doneOf(r, 'a')).toBe(20);
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

  describe('lump', () => {
    it('lump 0 or absent is deep-equal to today', () => {
      for (const order of ['rate', 'balance'] as const) {
        expect(strategy(both, m(10_000), order, { lump: m(0) })).toEqual(strategy(both, m(10_000), order));
      }
    });

    it('negative lump throws', () => {
      expect(() => strategy(both, m(0), 'rate', { lump: -1 as MinorUnits })).toThrow(/^strategy: lump must be >= 0/);
    });

    it('a lump covering every balance clears at month 0', () => {
      const r = strategy(both, m(0), 'rate', { lump: m(570_000) });
      expect(r.outcome).toBe('cleared');
      expect(r.months).toBe(0);
      expect(r.totalInterest).toBe(0);
      expect(r.debts.map((d) => d.doneMonth)).toEqual([0, 0]);
    });

    it('a small lump drops only the first debt in order', () => {
      const rate = strategy(both, m(10_000), 'rate', { lump: m(20_000) });
      const bal = strategy(both, m(10_000), 'balance', { lump: m(20_000) });
      const none = strategy(both, m(10_000), 'rate');
      expect(rate.totalInterest as number).toBeLessThan(none.totalInterest as number);
      // 'rate' pays the card (higher rate), 'balance' pays the loan (smaller balance)
      expect(rate.debts[0]?.interest).toBeLessThan(none.debts[0]?.interest as number);
      expect(bal.debts[1]?.interest).toBeLessThan(
        strategy(both, m(10_000), 'balance').debts[1]?.interest as number
      );
    });

    it('a lump larger than the first debt spills to the next; budget does not shrink', () => {
      const r = strategy(both, m(0), 'balance', { lump: m(200_000) });
      expect(doneOf(r, 'loan')).toBe(0);
      expect(r.budget).toBe(19_500);
      expect(doneOf(r, 'card') as number).toBeGreaterThan(0);
      const plain = strategy(both, m(0), 'balance');
      expect(r.months).toBeLessThan(plain.months);
    });

    it('a lump on a never-clearing plan can make it clear', () => {
      const weak = { ...card, minimum: m(5_000) };
      expect(strategy([weak], m(0), 'rate').outcome).toBe('never_clears');
      expect(strategy([weak], m(0), 'rate', { lump: m(400_000) }).outcome).toBe('cleared');
    });

    it('one debt matches fixedPayoff with the same lump', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 2_000_000 }),
          fc.integer({ min: 0, max: 3_000 }),
          fc.integer({ min: 1, max: 100_000 }),
          fc.integer({ min: 0, max: 2_500_000 }),
          (balance, apr, minimum, lump) => {
            const d: PlanDebt = {
              id: 'x',
              balance: m(balance),
              apr: percent((apr / 100).toFixed(2)),
              minimum: m(minimum),
            };
            const s = strategy([d], m(0), 'rate', { lump: m(lump) });
            const f = fixedPayoff(d.balance, d.apr, d.minimum, { lump: m(lump) });
            expect(s.outcome).toBe(f.outcome);
            expect(s.months).toBe(f.months);
            expect(s.totalInterest).toBe(f.totalInterest);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('more lump never worsens months or interest (cleared cases)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              balance: fc.integer({ min: 0, max: 1_000_000 }),
              apr: fc.integer({ min: 0, max: 3_000 }),
              minimum: fc.integer({ min: 1_000, max: 100_000 }),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          fc.integer({ min: 0, max: 500_000 }),
          fc.integer({ min: 0, max: 500_000 }),
          fc.constantFrom('rate' as const, 'balance' as const),
          (l, a, b, order) => {
            const plan: PlanDebt[] = l.map((d, i) => ({
              id: `d${i}`,
              balance: m(d.balance),
              apr: percent((d.apr / 100).toFixed(2)),
              minimum: m(d.minimum),
            }));
            const lo = strategy(plan, m(1_000), order, { lump: m(Math.min(a, b)) });
            const hi = strategy(plan, m(1_000), order, { lump: m(Math.max(a, b)) });
            if (lo.outcome === 'cleared' && hi.outcome === 'cleared') {
              expect(hi.months).toBeLessThanOrEqual(lo.months);
              expect(hi.totalInterest as number).toBeLessThanOrEqual(lo.totalInterest as number);
              expect(Number.isSafeInteger(hi.totalInterest)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
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
            expect(r.budget).toBe(l.reduce((s, d) => s + (d.balance > 0 ? d.minimum : 0), 0) + extra); // P2-WR-08: a $0 debt's minimum is not paid
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
