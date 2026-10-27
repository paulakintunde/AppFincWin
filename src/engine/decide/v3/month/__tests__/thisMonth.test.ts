import { assert as fcAssert, integer, property } from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import type { IncomeThisMonth, V3Line, V3Month, V3Series } from '../../types';
import { erestOf, thisMonth, type ThisMonthInput } from '../thisMonth';

function ser(over: Partial<V3Series> & { id: string }): V3Series {
  return {
    role: 'bill',
    cadence: { unit: 'month', every: 1 },
    anchorDate: '2026-01-01',
    endDate: null,
    amount: mu(150000),
    status: 'live',
    confirmed: true,
    payGroup: null,
    countsAs: null,
    incomeKind: null,
    typicalChoice: null,
    categoryId: null,
    isHousing: false,
    savingMode: null,
    ...over,
  };
}

function line(over: Partial<V3Line> & { id: string }): V3Line {
  return {
    date: '2026-10-02',
    amount: mu(10000),
    role: 'spending',
    status: 'paid',
    seriesId: null,
    categoryId: null,
    coversMonths: null,
    expected: false,
    incomeKind: null,
    countsAs: null,
    ...over,
  };
}

const income = (total: number): IncomeThisMonth => ({ received: mu(total), dueConfirmed: mu(0), total: mu(total), reasons: [] });
const month = (lines: V3Line[]): V3Month => ({ month: '2026-10', full: false, mark: null, lines });

const rent = ser({ id: 'rent', amount: mu(150000), anchorDate: '2026-01-01' });
const utilities = ser({ id: 'util', amount: mu(30000), anchorDate: '2026-01-15' });

function input(over: Partial<ThisMonthInput> = {}): ThisMonthInput {
  return {
    asOf: '2026-10-03',
    current: month([]),
    series: [rent, utilities],
    income: income(400000),
    e: mu(147500),
    roughExpenses: null,
    setAside: mu(30000),
    ...over,
  };
}

const samLines = [line({ id: 'r', date: '2026-10-01', amount: mu(150000), seriesId: 'rent' }), line({ id: 'e1', amount: mu(10000) })];

describe('erestOf', () => {
  it('takes the pace over the days left when it is larger', () => {
    expect(erestOf(mu(310000), mu(310000), 1, 31)).toBe(300000);
  });
  it('takes the unlogged part of a typical month when it is larger', () => {
    expect(erestOf(mu(147500), mu(10000), 3, 31)).toBe(137500);
  });
  it('is 0 on the last day when everything is logged', () => {
    expect(erestOf(mu(1000), mu(1000), 31, 31)).toBe(0);
  });
  it('rejects a day outside the month', () => {
    expect(() => erestOf(mu(1), mu(0), 0, 31)).toThrow(RangeError);
    expect(() => erestOf(mu(1), mu(0), 32, 31)).toThrow(RangeError);
    expect(() => erestOf(mu(1), mu(0), 1, 0)).toThrow(RangeError);
  });
  it('I2 no zero-spend', () => {
    fcAssert(
      property(
        integer({ min: 0, max: 5_000_000 }),
        integer({ min: 1, max: 31 }),
        integer({ min: 0, max: 5_000_000 }),
        (e, d, logged) => {
          const r = erestOf(mu(e), mu(logged), d, 31);
          expect(r).toBeGreaterThanOrEqual(Math.round((e * (31 - d)) / 31) - 1);
          if (logged <= e) expect(r + logged).toBeGreaterThanOrEqual(e);
        }
      ),
      { numRuns: 150 }
    );
  });
});

describe('thisMonth', () => {
  it('C15 Sam Oct 3', () => {
    const r = thisMonth(input({ current: month(samLines) }));
    expect(r.day).toBe(3);
    expect(r.daysInMonth).toBe(31);
    expect(r.erest).toBe(137500);
    expect(r.billsPaid).toBe(150000);
    expect(r.billsDue).toBe(30000);
    expect(r.everydayLogged).toBe(10000);
    expect(r.setAside).toBe(30000);
    expect(r.moneyOut).toBe(357500);
    expect(r.moneyIn).toBe(400000);
    expect(r.monthLeft).toBe(42500);
    expect(r.everydayUnknown).toBe(false);
  });

  it('D-02 yearly bill counts in full in its due month only', () => {
    const yearly = ser({ id: 'ins', amount: mu(90000), cadence: { unit: 'month', every: 12 }, anchorDate: '2025-10-20' });
    const inOct = thisMonth(input({ series: [yearly] }));
    expect(inOct.billsDue).toBe(90000);
    const nov = ser({ id: 'ins2', amount: mu(90000), cadence: { unit: 'month', every: 12 }, anchorDate: '2025-11-20' });
    expect(thisMonth(input({ series: [nov] })).billsDue).toBe(0);
  });

  it('D-02 instalments count each occurrence in the month', () => {
    const inst = ser({ id: 'i', amount: mu(1000), cadence: { unit: 'week', every: 2 }, anchorDate: '2026-10-05' });
    // 10-05, 10-19 (10-02 is before asOf 10-03)
    expect(thisMonth(input({ series: [inst] })).billsDue).toBe(2000);
  });

  it('D-51 past due stays due: an unpaid bill dated before asOf is still counted', () => {
    const r = thisMonth(input({ asOf: '2026-10-20', series: [rent], current: month([]) }));
    expect(r.billsDue).toBe(150000);
  });

  it('D-51 a bill settled in an earlier part of the month is paid, not due', () => {
    const r = thisMonth(
      input({ asOf: '2026-10-20', series: [rent], current: month([line({ id: 'r', date: '2026-10-02', amount: mu(150000), seriesId: 'rent' })]) })
    );
    expect(r.billsDue).toBe(0);
    expect(r.billsPaid).toBe(150000);
  });

  it('D-56 a typed or statement line of the right amount settles the bill and is counted once, as that bill', () => {
    for (const source of [undefined, 'statement'] as const) {
      const r = thisMonth(
        input({
          asOf: '2026-10-20',
          series: [rent],
          current: month([line({ id: 't', date: '2026-10-03', amount: mu(150000), source })]),
        })
      );
      expect(r.billsDue).toBe(0);
      expect(r.billsPaid).toBe(150000);
      expect(r.everydayLogged).toBe(0);
    }
    const off = thisMonth(
      input({ asOf: '2026-10-20', series: [rent], current: month([line({ id: 't', date: '2026-10-03', amount: mu(100000) })]) })
    );
    expect(off.billsDue).toBe(150000);
    expect(off.everydayLogged).toBe(100000);
  });

  it('D-64 a payment smaller than the bill settles it but the bill still counts in full', () => {
    const bill = ser({ id: 'b500', amount: mu(50000), anchorDate: '2026-01-01' });
    for (const source of [undefined, 'statement'] as const) {
      const r = thisMonth(
        input({ asOf: '2026-10-20', series: [bill], current: month([line({ id: 'p', date: '2026-10-02', amount: mu(46000), source })]) })
      );
      expect(r.billsDue).toBe(0);
      expect(r.billsPaid).toBe(50000);
      expect(r.everydayLogged).toBe(0);
    }
    const linked = thisMonth(
      input({ asOf: '2026-10-20', series: [bill], current: month([line({ id: 'p', date: '2026-10-02', amount: mu(46000), seriesId: 'b500' })]) })
    );
    expect(linked.billsPaid).toBe(50000);
    const over = thisMonth(
      input({ asOf: '2026-10-20', series: [bill], current: month([line({ id: 'p', date: '2026-10-02', amount: mu(52000) })]) })
    );
    expect(over.billsPaid).toBe(52000);
  });

  it('D-64 logging a payment near the bill never raises monthLeft', () => {
    fcAssert(
      property(
        integer({ min: 1, max: 31 }),
        integer({ min: 0, max: 400_000 }),
        integer({ min: 120_000, max: 180_000 }),
        integer({ min: 1, max: 28 }),
        (d, e, paid, day) => {
          const asOf = `2026-10-${String(d).padStart(2, '0')}`;
          const mk = (lines: V3Line[]) => thisMonth(input({ asOf, e: mu(e), series: [rent], current: month(lines) })).monthLeft;
          const pay = line({ id: 'pay', date: `2026-10-${String(day).padStart(2, '0')}`, amount: mu(paid) });
          expect(mk([pay])).toBeLessThanOrEqual(mk([]));
        }
      ),
      { numRuns: 200 }
    );
  });

  it('M-02 two occurrences of one series 5 days apart: line order does not change billsDue', () => {
    const w = ser({ id: 'w', amount: mu(500), cadence: { unit: 'week', every: 1 }, anchorDate: '2026-10-01' });
    const a = line({ id: 'a', date: '2026-10-06', amount: mu(500), seriesId: 'w' });
    const b = line({ id: 'b', date: '2026-10-13', amount: mu(500), seriesId: 'w' });
    const fwd = thisMonth(input({ asOf: '2026-10-14', series: [w], current: month([a, b]) }));
    const rev = thisMonth(input({ asOf: '2026-10-14', series: [w], current: month([b, a]) }));
    expect(rev.billsDue).toBe(fwd.billsDue);
  });

  it('a paid occurrence is not counted again as due', () => {
    const r = thisMonth(
      input({
        asOf: '2026-10-16',
        series: [utilities],
        current: month([line({ id: 'u', date: '2026-10-14', amount: mu(30000), seriesId: 'util' })]),
      })
    );
    expect(r.billsPaid).toBe(30000);
    expect(r.billsDue).toBe(0);
  });

  it('a paid line far from the occurrence does not settle it; each line matches once', () => {
    const far = thisMonth(
      input({
        asOf: '2026-10-03',
        series: [utilities],
        current: month([line({ id: 'u', date: '2026-10-03', amount: mu(30000), seriesId: 'util' })]),
      })
    );
    expect(far.billsDue).toBe(30000);
    const twice = ser({ id: 'w', amount: mu(500), cadence: { unit: 'week', every: 1 }, anchorDate: '2026-10-05' });
    const one = thisMonth(
      input({
        series: [twice],
        asOf: '2026-10-04',
        current: month([line({ id: 'p', date: '2026-10-05', amount: mu(500), seriesId: 'w' })]),
      })
    );
    expect(one.billsDue).toBe(500 * 3); // 10-12, 10-19, 10-26; 10-05 settled
  });

  it('an unconfirmed bill line is everyday', () => {
    const unconf = ser({ id: 'u2', confirmed: false });
    const r = thisMonth(
      input({ series: [unconf], current: month([line({ id: 'x', amount: mu(7000), seriesId: 'u2', categoryId: 'c1' })]) })
    );
    expect(r.everydayLogged).toBe(7000);
    expect(r.billsPaid).toBe(0);
  });

  it('refunds net against everyday, floored at 0; other roles and pending lines are ignored', () => {
    const r = thisMonth(
      input({
        current: month([
          line({ id: 'a', amount: mu(5000) }),
          line({ id: 'b', amount: mu(8000), role: 'refund' }),
          line({ id: 'c', amount: mu(999), role: 'debt_payment' }),
          line({ id: 'd', amount: mu(999), status: 'pending' }),
          line({ id: 'f', amount: mu(999), date: '2026-09-30' }),
          line({ id: 'g', amount: mu(999), role: 'income' }),
        ]),
      })
    );
    expect(r.everydayLogged).toBe(0);
  });

  it('largestLine is the biggest everyday category, null when none', () => {
    const r = thisMonth(
      input({
        current: month([
          line({ id: 'a', amount: mu(1000), categoryId: 'food' }),
          line({ id: 'b', amount: mu(2500), categoryId: 'fun' }),
          line({ id: 'c', amount: mu(1600), categoryId: 'food' }),
          line({ id: 'd', amount: mu(2600), categoryId: 'bar' }),
          line({ id: 'e', amount: mu(2600), categoryId: 'zed' }),
        ]),
      })
    );
    expect(r.largestLine).toEqual({ categoryId: 'bar', amount: 2600 });
    expect(thisMonth(input({ current: null })).largestLine).toBeNull();
    const nul = thisMonth(
      input({ current: month([line({ id: 'a', amount: mu(10) }), line({ id: 'b', amount: mu(10), categoryId: 'a' })]) })
    );
    expect(nul.largestLine?.categoryId).toBeNull();
    const nullLater = thisMonth(
      input({ current: month([line({ id: 'a', amount: mu(10), categoryId: 'a' }), line({ id: 'b', amount: mu(10) })]) })
    );
    expect(nullLater.largestLine?.categoryId).toBeNull();
  });

  it('e unknown: rough expenses fill in, otherwise flagged', () => {
    const rough = thisMonth(input({ e: null, roughExpenses: mu(50000), current: month([line({ id: 'a', amount: mu(20000) })]) }));
    expect(rough.erest).toBe(30000);
    expect(rough.everydayUnknown).toBe(false);
    const over = thisMonth(input({ e: null, roughExpenses: mu(1000), current: month([line({ id: 'a', amount: mu(20000) })]) }));
    expect(over.erest).toBe(0);
    const none = thisMonth(input({ e: null, roughExpenses: null }));
    expect(none.erest).toBe(0);
    expect(none.everydayUnknown).toBe(true);
  });

  it('monthLeft can be negative', () => {
    expect(thisMonth(input({ income: income(0) })).monthLeft).toBeLessThan(0);
  });

  it('I21 logging more spending never raises monthLeft', () => {
    fcAssert(
      property(
        integer({ min: 1, max: 31 }),
        integer({ min: 0, max: 400_000 }),
        integer({ min: 0, max: 400_000 }),
        integer({ min: 0, max: 400_000 }),
        (d, e, base, extra) => {
          const asOf = `2026-10-${String(d).padStart(2, '0')}`;
          const mk = (lines: V3Line[]) => thisMonth(input({ asOf, e: mu(e), series: [rent], current: month(lines) })).monthLeft; // D-64: with a bill series, settling never raises money left
          const l1 = line({ id: 'a', date: '2026-10-01', amount: mu(base) });
          const l2 = line({ id: 'b', date: '2026-10-01', amount: mu(extra) });
          expect(mk([l1, l2])).toBeLessThanOrEqual(mk([l1]));
        }
      ),
      { numRuns: 150 }
    );
  });
});
