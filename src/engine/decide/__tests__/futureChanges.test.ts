import fc from 'fast-check';
import { currencyCode, minorUnits } from '../../money/types';
import { assertValidChange, changeActiveIn, monthAfter, worstFutureMonth } from '../futureChanges';
import type { FutureChange, FutureChangeKind, WorstMonthInput } from '../types';

const USD = currencyCode('USD');
const m = minorUnits;
let seq = 0;

function chg(kind: FutureChangeKind, amount: number, start: string, end: string | null = null): FutureChange {
  seq += 1;
  return { id: `c${seq}`, kind, monthlyAmount: m(amount), startMonth: start, endMonth: end, currency: USD };
}

function input(changes: FutureChange[], over: Partial<WorstMonthInput> = {}): WorstMonthInput {
  return {
    asOf: '2026-07-10',
    currency: USD,
    monthIncome: m(600_000),
    monthSpending: m(300_000),
    fixedOutgoings: m(175_000),
    changes,
    ...over,
  };
}

describe('monthAfter', () => {
  it('steps whole months across year ends', () => {
    expect(monthAfter('2026-07-10', 1)).toBe('2026-08');
    expect(monthAfter('2026-12-31', 1)).toBe('2027-01');
    expect(monthAfter('2026-07-10', 12)).toBe('2027-07');
    expect(monthAfter('2026-07-10', 0)).toBe('2026-07');
  });

  it('rejects bad dates and steps', () => {
    expect(() => monthAfter('2026-02-30', 1)).toThrow(/^monthAfter: /);
    expect(() => monthAfter('2026-02-01', -1)).toThrow(/^monthAfter: /);
    expect(() => monthAfter('2026-02-01', 1.5)).toThrow(/^monthAfter: /);
  });
});

describe('changeActiveIn', () => {
  it('is inclusive at both ends', () => {
    const c = chg('spending', 1, '2026-09', '2026-10');
    expect(changeActiveIn(c, '2026-08')).toBe(false);
    expect(changeActiveIn(c, '2026-09')).toBe(true);
    expect(changeActiveIn(c, '2026-10')).toBe(true);
    expect(changeActiveIn(c, '2026-11')).toBe(false);
  });

  it('has no end when endMonth is null', () => {
    expect(changeActiveIn(chg('income', 1, '2026-09'), '2030-01')).toBe(true);
  });
});

describe('worstFutureMonth', () => {
  it('with no changes every month is equal and the earliest wins', () => {
    expect(worstFutureMonth(input([]))).toEqual({
      month: '2026-08',
      offset: 1,
      income: 600_000,
      spending: 300_000,
      leftBefore: 125_000,
      incomeDelta: 0,
      spendingDelta: 0,
    });
  });

  it('finds the first month a rise in spending bites', () => {
    const w = worstFutureMonth(input([chg('spending', 90_000, '2026-11'), chg('income', 50_000, '2026-08')]));
    expect(w).toMatchObject({
      month: '2026-11',
      offset: 4,
      leftBefore: 85_000,
      incomeDelta: 50_000,
      spendingDelta: 90_000,
    });
  });

  it('a raise never rescues an earlier shortfall', () => {
    const w = worstFutureMonth(
      input([chg('spending', 200_000, '2026-09', '2026-09'), chg('income', 500_000, '2026-10')])
    );
    expect(w.month).toBe('2026-09');
    expect(w.leftBefore).toBe(-75_000);
  });

  it('treats endMonth as inclusive', () => {
    const w = worstFutureMonth(input([chg('spending', 10_000, '2026-08', '2026-08')]));
    expect(w.month).toBe('2026-08');
    expect(w.leftBefore).toBe(115_000);
  });

  it('ignores a change starting after the window and applies an older running change to all months', () => {
    expect(worstFutureMonth(input([chg('spending', 999_999, '2027-08')])).leftBefore).toBe(125_000);
    expect(worstFutureMonth(input([chg('spending', 10_000, '2026-01')]))).toMatchObject({
      month: '2026-08',
      leftBefore: 115_000,
    });
  });

  it('floors income and spending at 0', () => {
    const inc = worstFutureMonth(input([chg('income', -900_000, '2026-08')]));
    expect(inc).toMatchObject({ income: 0, incomeDelta: -600_000, leftBefore: -475_000 });
    const sp = worstFutureMonth(input([chg('spending', -400_000, '2026-08')]));
    expect(sp).toMatchObject({ spending: 0, spendingDelta: -300_000 });
  });

  it('keeps the earliest month on a tie and ignores the as-of month', () => {
    const w = worstFutureMonth(
      input([chg('spending', 50_000, '2026-07', '2026-07'), chg('spending', 50_000, '2026-09', '2026-10')])
    );
    expect(w).toMatchObject({ month: '2026-09', offset: 2, leftBefore: 75_000 });
  });

  it('rejects malformed input', () => {
    const bad = (c: FutureChange) => () => worstFutureMonth(input([c]));
    expect(bad(chg('income', 1, '2026-13'))).toThrow(/^worstFutureMonth: /);
    expect(bad(chg('income', 1, '2026-09', '2026-08'))).toThrow(/^worstFutureMonth: /);
    expect(bad(chg('income', 1, '2026-09', '2026-1'))).toThrow(/^worstFutureMonth: /);
    expect(bad({ ...chg('income', 1, '2026-09'), monthlyAmount: 1.5 as never })).toThrow(/^worstFutureMonth: /);
    expect(bad({ ...chg('income', 1, '2026-09'), kind: 'other' as never })).toThrow(/^worstFutureMonth: /);
    expect(() => worstFutureMonth(input([], { asOf: '2026-02-30' }))).toThrow(/^worstFutureMonth: /);
    expect(() => worstFutureMonth(input([], { fixedOutgoings: -1 as never }))).toThrow(/^worstFutureMonth: /);
    expect(() => worstFutureMonth(input([], { monthIncome: -1 as never }))).toThrow(/^worstFutureMonth: /);
    expect(() => worstFutureMonth(input([], { monthSpending: 1.5 as never }))).toThrow(/^worstFutureMonth: /);
    expect(() =>
      worstFutureMonth(input([{ ...chg('income', 1, '2026-09'), currency: currencyCode('CAD') }]))
    ).toThrow(/^worstFutureMonth: mixed currencies/);
  });

  it('assertValidChange accepts a well-formed change', () => {
    expect(() => assertValidChange(chg('income', -5, '2026-09', '2026-09'), USD, 'x')).not.toThrow();
  });

  it('a later raise never improves an earlier month (D-45)', () => {
    const changeArb = fc.record({
      kind: fc.constantFrom<FutureChangeKind>('income', 'spending'),
      amount: fc.integer({ min: -400_000, max: 400_000 }),
      start: fc.integer({ min: 1, max: 12 }),
      len: fc.option(fc.integer({ min: 0, max: 6 }), { nil: null }),
    });
    fc.assert(
      fc.property(
        fc.array(changeArb, { maxLength: 5 }),
        fc.integer({ min: 2, max: 12 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (specs, s, raise) => {
          const toChange = (x: (typeof specs)[number]) =>
            chg(
              x.kind,
              x.amount,
              monthAfter('2026-07-10', x.start),
              x.len === null ? null : monthAfter('2026-07-10', x.start + x.len)
            );
          const base = specs.map(toChange);
          const raised = [...base, chg('income', raise, monthAfter('2026-07-10', s))];
          const lefts = (cs: FutureChange[]) =>
            Array.from({ length: 12 }, (_, i) => {
              const mo = monthAfter('2026-07-10', i + 1);
              let inc = 600_000;
              let sp = 300_000;
              for (const c of cs) {
                if (!changeActiveIn(c, mo)) continue;
                if (c.kind === 'income') inc += c.monthlyAmount;
                else sp += c.monthlyAmount;
              }
              return Math.max(0, inc) - Math.max(0, sp) - 175_000;
            });
          const before = lefts(base);
          const after = lefts(raised);
          for (let i = 0; i < s - 1; i += 1) expect(after[i]).toBe(before[i]);
          const worst = worstFutureMonth(input(raised));
          expect(worst.leftBefore).toBeLessThanOrEqual(Math.min(...before.slice(0, s - 1)));
          expect(worst.leftBefore).toBe(Math.min(...after));
        }
      )
    );
  });
});
