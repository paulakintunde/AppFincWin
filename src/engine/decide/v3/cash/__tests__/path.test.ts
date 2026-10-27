import fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { SOLE_SHARE } from '../../../share';
import { addDays, daysInYearMonth, dayOfMonth, yearMonthOf } from '../../dates';
import { buildCashPathV3, cashCheck, nextPayDate, purchaseFlows, spreadThrough } from '../path';
import type { Schedule } from '../../types';
import { v3Series } from '../../__tests__/helpers/fixtures';

const mu = (n: number) => minorUnits(n);
const MONTH = { unit: 'month', every: 1 } as const;
const none = new Set<string>();

const tiaSeries = [
  v3Series({ id: 'pay', role: 'pay', cadence: MONTH, anchorDate: '2026-04-28', amount: 260000 }),
  v3Series({ id: 'rent', role: 'bill', cadence: MONTH, anchorDate: '2026-04-01', amount: 140000 }),
  v3Series({ id: 'phone', role: 'bill', cadence: MONTH, anchorDate: '2026-04-05', amount: 8000 }),
];

function path(over: Partial<Parameters<typeof buildCashPathV3>[0]> = {}) {
  return buildCashPathV3({
    asOf: '2026-10-20',
    days: 90,
    opening: mu(0),
    series: [],
    paidThisMonth: none,
    erest: mu(0),
    e: mu(0),
    extraOut: [],
    ...over,
  });
}

describe('spreadThrough (I2 path spread)', () => {
  it('I2 path spread: erest by month end, then exactly e per later month', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 600 }),
        (erest, e, offset) => {
          const asOf = addDays('2026-01-01', offset);
          const input = { erest: mu(erest), e: mu(e), asOf };
          const n = daysInYearMonth(yearMonthOf(asOf));
          const r = n - dayOfMonth(asOf) + 1;
          expect(spreadThrough(r - 1, input)).toBe(BigInt(erest));
          const nextEnd = addDays(asOf, r + daysInYearMonth(yearMonthOf(addDays(asOf, r))) - 1);
          expect(spreadThrough(r + daysInYearMonth(yearMonthOf(addDays(asOf, r))) - 1, input)).toBe(BigInt(erest + e));
          expect(yearMonthOf(nextEnd)).toBe(yearMonthOf(addDays(asOf, r)));
          let prev = -1n;
          for (let i = 0; i < 90; i++) {
            const v = spreadThrough(i, input);
            expect(v >= prev).toBe(true);
            prev = v;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects a bad day', () => {
    expect(() => spreadThrough(-1, { erest: mu(1), e: mu(1), asOf: '2026-10-20' })).toThrow(RangeError);
    expect(() => spreadThrough(1.5, { erest: mu(1), e: mu(1), asOf: '2026-10-20' })).toThrow(RangeError);
  });
});

describe('buildCashPathV3', () => {
  it('I19 Erest spent once: opens at the balance and takes nothing else', () => {
    const p = path({ opening: mu(50000) });
    expect(p.points).toHaveLength(90);
    expect(p.points.every((x) => x.balance === 50000)).toBe(true);
    const q = path({ opening: mu(50000), erest: mu(1200) });
    expect(q.points[11]?.balance).toBe(50000 - 1200);
    expect(q.points[89]?.balance).toBe(50000 - 1200);
  });

  it('never assumes zero spending (I2): e drains later months', () => {
    const p = path({ opening: mu(100000), erest: mu(0), e: mu(31000) });
    // Oct 20 asOf; Nov complete is day index 12..41
    expect(p.points[41]?.balance).toBe(100000 - 31000);
  });

  it('D-02 dated flows: bills out, confirmed pay in, on their dates', () => {
    const p = path({ opening: mu(20000), series: tiaSeries });
    const at = (d: string) => p.points.find((x) => x.date === d)?.balance;
    expect(at('2026-10-27')).toBe(20000);
    expect(at('2026-10-28')).toBe(280000);
    expect(at('2026-11-01')).toBe(140000);
    expect(at('2026-11-05')).toBe(132000);
  });

  it('skips a bill already paid this month', () => {
    const p = path({ opening: mu(20000), series: tiaSeries, paidThisMonth: new Set(['phone|2026-11-05']) });
    expect(p.points.find((x) => x.date === '2026-11-05')?.balance).toBe(140000);
  });

  it('I34 an unconfirmed pay series adds nothing; dismissed too', () => {
    const un = [{ ...tiaSeries[0]!, confirmed: false }];
    expect(path({ opening: mu(10), series: un }).points.every((x) => x.balance === 10)).toBe(true);
    const dis = [{ ...tiaSeries[0]!, status: 'dismissed' as const }];
    expect(path({ opening: mu(10), series: dis }).points.every((x) => x.balance === 10)).toBe(true);
  });

  it('I3 a pay missed before asOf adds nothing', () => {
    const missed = [v3Series({ id: 'p', role: 'pay', cadence: MONTH, anchorDate: '2026-10-15', amount: 100000 })];
    const p = path({ opening: mu(0), series: missed });
    expect(p.points.find((x) => x.date === '2026-10-31')?.balance).toBe(0);
    expect(p.points.find((x) => x.date === '2026-11-15')?.balance).toBe(100000);
  });

  it('debt payments are dated money out; saving is not taken', () => {
    const s = [
      v3Series({ id: 'd', role: 'debt_payment', cadence: MONTH, anchorDate: '2026-10-25', amount: 5000 }),
      v3Series({ id: 'sv', role: 'saving', cadence: MONTH, anchorDate: '2026-10-25', amount: 9000 }),
    ];
    expect(path({ opening: mu(10000), series: s }).points[5]?.balance).toBe(5000);
  });

  it('extra flows: on asOf, in the past (clamped to day 0), and beyond the window (ignored)', () => {
    const p = path({
      opening: mu(100),
      extraOut: [
        { date: '2026-10-20', amount: mu(10) },
        { date: '2026-10-01', amount: mu(5) },
        { date: '2027-06-01', amount: mu(99) },
      ],
    });
    expect(p.points[0]?.balance).toBe(85);
    expect(p.points[89]?.balance).toBe(85);
  });

  it('T-05.1-33 rejects a path longer than 90 days or shorter than 1', () => {
    expect(() => path({ days: 91 })).toThrow(RangeError);
    expect(() => path({ days: 0 })).toThrow(RangeError);
    expect(() => path({ days: 2.5 })).toThrow(RangeError);
  });
});

describe('buildCashPathV3 payCaps (D-35 cap, D-46)', () => {
  const big = v3Series({ id: 'pay', role: 'pay', cadence: MONTH, anchorDate: '2026-10-15', amount: 520_000 });
  const at = (p: { readonly points: readonly { readonly date: string; readonly balance: number }[] }, date: string) =>
    (p.points.find((x) => x.date === date) as { readonly balance: number }).balance;

  it('D-35 cap: null caps leave the path as it is, with no capped total', () => {
    const plain = path({ asOf: '2026-11-03', series: [big] });
    const nullCaps = path({ asOf: '2026-11-03', series: [big], payCaps: null });
    expect(nullCaps).toEqual(plain);
    expect(plain.capped).toBeUndefined();
  });

  it('D-35 cap: pay lands at the month expected figure, later months likewise, and the capped total is reported', () => {
    const caps = new Map([['2026-11', mu(210_000)], ['2026-12', mu(100_000)], ['2027-01', mu(1_000_000)]]);
    const p = path({ asOf: '2026-11-03', series: [big], payCaps: caps });
    expect(at(p, '2026-11-14')).toBe(0);
    expect(at(p, '2026-11-15')).toBe(210_000);
    expect(at(p, '2026-12-14')).toBe(210_000);
    expect(at(p, '2026-12-15')).toBe(310_000);
    expect(at(p, '2027-01-14')).toBe(310_000);
    expect(at(p, '2027-01-15')).toBe(830_000);
    expect(p.capped).toBe(730_000);
  });

  it('D-35 cap: two pay occurrences in one month share the cap in date order, then series id', () => {
    const a = v3Series({ id: 'b', role: 'pay', cadence: MONTH, anchorDate: '2026-11-10', amount: 200_000 });
    const b = v3Series({ id: 'a', role: 'pay', cadence: MONTH, anchorDate: '2026-11-10', amount: 200_000 });
    const c = v3Series({ id: 'c', role: 'pay', cadence: MONTH, anchorDate: '2026-11-05', amount: 200_000 });
    const p = path({ asOf: '2026-11-03', days: 20, series: [a, b, c], payCaps: new Map([['2026-11', mu(300_000)]]) });
    expect(at(p, '2026-11-05')).toBe(200_000);
    expect(at(p, '2026-11-10')).toBe(300_000);
    expect(p.capped).toBe(300_000);
  });

  it('D-35 cap: a month with no cap lands nothing; an exactly-met cap withholds nothing', () => {
    const none = path({ asOf: '2026-11-03', days: 30, series: [big], payCaps: new Map() });
    expect(at(none, '2026-11-30')).toBe(0);
    expect(none.capped).toBe(520_000);
    const exact = path({ asOf: '2026-11-03', days: 30, series: [big], payCaps: new Map([['2026-11', mu(520_000)]]) });
    expect(at(exact, '2026-11-30')).toBe(520_000);
    expect(exact.capped).toBeUndefined();
  });

  it('D-35 cap: a paid occurrence is still skipped, and the cap never raises any point of the path', () => {
    const settled = path({ asOf: '2026-10-20', days: 20, series: [big], paidThisMonth: new Set(['pay|2026-10-15']), payCaps: new Map([['2026-10', mu(1)]]) });
    expect(settled.capped).toBeUndefined();
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 900_000 }), fc.integer({ min: 0, max: 900_000 }), (c1, c2) => {
        const free = path({ asOf: '2026-11-03', series: [big] });
        const capped = path({ asOf: '2026-11-03', series: [big], payCaps: new Map([['2026-11', mu(c1)], ['2026-12', mu(c2)]]) });
        capped.points.forEach((pt, i) => expect(pt.balance <= (free.points[i] as { balance: number }).balance).toBe(true));
      }),
      { numRuns: 50 }
    );
  });
});

describe('nextPayDate', () => {
  it('first confirmed live pay on or after asOf', () => {
    expect(nextPayDate(tiaSeries, '2026-10-20')).toBe('2026-10-28');
    expect(nextPayDate(tiaSeries, '2026-10-28')).toBe('2026-10-28');
  });
  it('takes the earliest across several pay series', () => {
    const two = [...tiaSeries, v3Series({ id: 'p2', role: 'pay', cadence: MONTH, anchorDate: '2026-10-22', amount: 1 })];
    expect(nextPayDate(two, '2026-10-20')).toBe('2026-10-22');
    expect(nextPayDate([...two].reverse(), '2026-10-20')).toBe('2026-10-22');
  });
  it('null when no confirmed pay (I34) or it has ended', () => {
    expect(nextPayDate([], '2026-10-20')).toBeNull();
    expect(nextPayDate([{ ...tiaSeries[0]!, confirmed: false }], '2026-10-20')).toBeNull();
    expect(nextPayDate([{ ...tiaSeries[0]!, endDate: '2026-09-30' }], '2026-10-20')).toBeNull();
  });
});

describe('cashCheck', () => {
  const tia = (purchase: number) =>
    path({
      opening: mu(20000),
      series: tiaSeries,
      erest: mu(20000),
      e: mu(80000),
      extraOut: [{ date: '2026-10-20', amount: mu(purchase) }],
    });

  it('v3 §12 #12 Tia payday: 35000 today is not_yet until 2026-10-28', () => {
    const c = cashCheck(tia(35000), nextPayDate(tiaSeries, '2026-10-20'));
    expect(c.kind).toBe('payday');
    if (c.kind === 'payday') {
      expect(c.until).toBe('2026-10-28');
      expect(c.shortBy).toBeGreaterThan(0);
    }
  });

  it('ok when the lowest point is not negative', () => {
    const c = cashCheck(tia(100), nextPayDate(tiaSeries, '2026-10-20'));
    expect(c.kind).toBe('ok');
    if (c.kind === 'ok') expect(c.lowest.balance).toBeGreaterThanOrEqual(0);
  });

  it('not covered: never recovers after the next pay, shortBy = -lowest', () => {
    const p = tia(5_000_000);
    const c = cashCheck(p, '2026-10-28');
    expect(c.kind).toBe('not_covered');
    const lowest = Math.min(...p.points.map((x) => x.balance));
    if (c.kind === 'not_covered') expect(c.shortBy).toBe(-lowest);
  });

  it('not covered without a pay date, or with a pay date past the window', () => {
    expect(cashCheck(tia(35000), null).kind).toBe('not_covered');
    expect(cashCheck(tia(35000), '2030-01-01').kind).toBe('not_covered');
  });

  it('not covered carries the next pay date (I13 residual), null when there is none', () => {
    expect(cashCheck(tia(5_000_000), '2026-10-28')).toMatchObject({ kind: 'not_covered', payDate: '2026-10-28' });
    expect(cashCheck(tia(35000), null)).toMatchObject({ kind: 'not_covered', payDate: null });
  });

  it('I12 less cash never helps: a lower opening never turns a shortfall into ok', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400000 }),
        fc.integer({ min: 0, max: 400000 }),
        fc.integer({ min: 0, max: 200000 }),
        (a, b, buy) => {
          const hi = Math.max(a, b);
          const lo = Math.min(a, b);
          const mk = (open: number) =>
            cashCheck(
              path({
                opening: mu(open),
                series: tiaSeries,
                erest: mu(20000),
                e: mu(80000),
                extraOut: [{ date: '2026-10-20', amount: mu(buy) }],
              }),
              '2026-10-28'
            );
          if (mk(hi).kind !== 'ok') expect(mk(lo).kind).not.toBe('ok');
          if (mk(hi).kind === 'not_covered') expect(mk(lo).kind).toBe('not_covered');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('purchaseFlows', () => {
  const schedule: Schedule = {
    cadence: MONTH,
    count: 3,
    payment: mu(10001),
    finalPayment: mu(10000),
    lastPaying: 3,
    firstDate: '2026-11-01',
    financed: mu(30002),
    pauseInterest: mu(0),
    totalPaid: mu(30002),
    totalInterest: mu(0),
    fees: { setup: mu(0), perPeriod: mu(0), end: mu(0) },
    monthlyEquivalent: mu(10001),
    source: 'computed',
  };
  it('dayOne on asOf, no schedule', () => {
    expect(purchaseFlows({ dayOne: mu(500), schedule: null, share: SOLE_SHARE }, '2026-10-20', 90)).toEqual([
      { date: '2026-10-20', amount: 500 },
    ]);
    expect(purchaseFlows({ dayOne: mu(0), schedule: null, share: SOLE_SHARE }, '2026-10-20', 90)).toEqual([]);
  });

  it('schedule payments land on their dates at my part, applied once', () => {
    const flows = purchaseFlows({ dayOne: mu(0), schedule, share: SOLE_SHARE }, '2026-10-20', 90);
    expect(flows.map((f) => f.date)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
    expect(flows.map((f) => f.amount)).toEqual([10001, 10001, 10000]);
  });

  it('share convention: 50/50 takes half of each full payment, never a quarter', () => {
    const flows = purchaseFlows({ dayOne: mu(0), schedule, share: { weights: [1, 1], myIndex: 0 } }, '2026-10-20', 90);
    for (const f of flows) {
      expect(Math.abs(f.amount - 5000)).toBeLessThanOrEqual(1);
    }
  });

  it('payments after the window are left out', () => {
    const flows = purchaseFlows({ dayOne: mu(0), schedule, share: SOLE_SHARE }, '2026-10-20', 20);
    expect(flows.map((f) => f.date)).toEqual(['2026-11-01']);
  });
});
