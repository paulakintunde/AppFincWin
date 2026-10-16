import fc from 'fast-check';
import { currencyCode, minorUnits } from '../../money/types';
import { divideHalfUp } from '../../money/rounding';
import type { RecurringFreq } from '../../recurring/schedule';
import {
  applyOutflows,
  buildCashPath,
  cashPathForSnapshot,
  cashPathMargin,
  cashPathReport,
  cashTightFact,
  classifyCashDip,
  dipShortfall,
  lowestPoint,
  purchaseFlows,
  seriesDatesInPath,
  spreadUndatedSpending,
} from '../cashPath';
import { SOLE_SHARE, type ResolvedShare } from '../share';
import { addDays } from '../series';
import type { CashDipInput, CashPathBase, MoneyBasis, Plan, SpendingShare } from '../types';
import { bill, income, outflow, snapshotOf } from './helpers/fixtures';

const m = minorUnits;
const ASOF = '2026-07-10';
const SOLE_SPENDING: SpendingShare = { byDefault: SOLE_SHARE, byCategory: [] };
const EVEN2: ResolvedShare = { weights: [1, 1], myIndex: 0 };
const EVEN_SPENDING: SpendingShare = { byDefault: EVEN2, byCategory: [] };

function moneyOf(spendingBasis: number): MoneyBasis {
  return { spendingBasis: m(spendingBasis) } as unknown as MoneyBasis;
}

const PAY = income({
  seriesId: 'pay',
  freq: 'monthly',
  anchorDate: '2026-01-25',
  lastPaidDate: '2026-06-25',
  latestAmount: 600_000,
});

function pathOf(over: Partial<Parameters<typeof cashPathForSnapshot>[0]['snapshot']> = {}, spending = SOLE_SPENDING) {
  return cashPathForSnapshot({
    snapshot: snapshotOf({ incomeSeries: [PAY], ...over }),
    money: moneyOf(300_000),
    spendingShare: spending,
    debtPayments: m(20_000),
  });
}

describe('seriesDatesInPath', () => {
  const pay = income({
    seriesId: 'p',
    freq: 'monthly',
    anchorDate: '2026-01-25',
    lastPaidDate: '2026-06-25',
    latestAmount: 1,
  });
  const rent = income({
    seriesId: 'r',
    freq: 'monthly',
    anchorDate: '2026-01-05',
    lastPaidDate: '2026-06-05',
    latestAmount: 1,
  });

  it('lists future pay dates', () => {
    expect(seriesDatesInPath(pay, ASOF, 90, 'drop')).toEqual(['2026-07-25', '2026-08-25', '2026-09-25']);
  });
  it('moves an unpaid date earlier in the month to day 0 (day_zero)', () => {
    expect(seriesDatesInPath(rent, ASOF, 90, 'day_zero')).toEqual([
      '2026-07-10',
      '2026-08-05',
      '2026-09-05',
      '2026-10-05',
    ]);
  });
  it('drops an unreceived past date (drop)', () => {
    expect(seriesDatesInPath(rent, ASOF, 90, 'drop')).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
  });
  it('does not repeat a settled date', () => {
    expect(seriesDatesInPath({ ...rent, lastPaidDate: '2026-07-05' }, ASOF, 90, 'day_zero')).toEqual([
      '2026-08-05',
      '2026-09-05',
      '2026-10-05',
    ]);
  });
  it('skips unconfirmed series', () => {
    expect(seriesDatesInPath({ ...rent, confirmed: false }, ASOF, 90, 'day_zero')).toEqual([]);
  });
  it('stops at endDate', () => {
    expect(seriesDatesInPath({ ...rent, endDate: '2026-08-31' }, ASOF, 90, 'drop')).toEqual(['2026-08-05']);
  });
  it('lists every weekly date', () => {
    const weekly = { ...pay, freq: 'weekly' as RecurringFreq, anchorDate: '2026-07-11', lastPaidDate: null };
    const dates = seriesDatesInPath(weekly, ASOF, 90, 'drop');
    expect(dates[0]).toBe('2026-07-11');
    expect(dates).toHaveLength(13);
  });
  it('rejects an invalid series', () => {
    expect(() => seriesDatesInPath({ ...pay, freq: 'daily' as RecurringFreq }, ASOF, 90, 'drop')).toThrow(RangeError);
  });
});

describe('spreadUndatedSpending (cumulative half-up spread)', () => {
  it('matches the worked figures', () => {
    expect(spreadUndatedSpending(m(36_500), 0)).toBe(1_200);
    expect(spreadUndatedSpending(m(36_500), 90)).toBe(109_200);
    expect(spreadUndatedSpending(m(1_000), 90)).toBe(2_992);
    expect(spreadUndatedSpending(m(0), 40)).toBe(0);
  });
  it('rejects a bad day or amount', () => {
    expect(() => spreadUndatedSpending(m(1), -1)).toThrow(/^RangeError: spreadUndatedSpending: |^spreadUndatedSpending: /);
    expect(() => spreadUndatedSpending(m(1), 1.5)).toThrow(RangeError);
    expect(() => spreadUndatedSpending(m(-1), 1)).toThrow(/spreadUndatedSpending: /);
  });
});

describe('buildCashPath', () => {
  const base = { asOf: ASOF, days: 90, opening: m(10_000), inflows: [], outflows: [], spreadMonthly: m(0) };
  it('is flat with nothing to spend', () => {
    const p = buildCashPath(base);
    expect(p.balances).toHaveLength(91);
    expect(new Set(p.balances)).toEqual(new Set([10_000]));
    expect(p.asOf).toBe(ASOF);
  });
  it('spreads spending by day', () => {
    const p = buildCashPath({ ...base, spreadMonthly: m(36_500) });
    expect(p.balances[0]).toBe(8_800);
    expect(p.balances[90]).toBe(-99_200);
  });
  it('has no drift in the daily steps', () => {
    const p = buildCashPath({ ...base, spreadMonthly: m(1_000) });
    expect(p.balances[90]).toBe(10_000 - 2_992);
    for (let d = 1; d <= 90; d++) {
      const step = p.balances[d - 1]! - p.balances[d]!;
      expect([32, 33]).toContain(step);
    }
  });
  it('places flows on their days', () => {
    const p = buildCashPath({
      ...base,
      inflows: [{ date: '2026-07-25', amount: m(50_000) }],
      outflows: [{ date: ASOF, amount: m(20_000) }],
    });
    expect(p.balances[0]).toBe(-10_000);
    expect(p.balances[14]).toBe(-10_000);
    expect(p.balances[15]).toBe(40_000);
  });
  it('rejects flows outside the window and bad inputs', () => {
    expect(() => buildCashPath({ ...base, outflows: [{ date: '2026-07-09', amount: m(1) }] })).toThrow(
      /buildCashPath: /
    );
    expect(() => buildCashPath({ ...base, inflows: [{ date: '2026-10-09', amount: m(1) }] })).toThrow(
      /buildCashPath: /
    );
    expect(() => buildCashPath({ ...base, outflows: [{ date: '2026-13-01', amount: m(1) }] })).toThrow(
      /buildCashPath: /
    );
    expect(() => buildCashPath({ ...base, spreadMonthly: m(-1) })).toThrow(/buildCashPath: /);
    expect(() => buildCashPath({ ...base, days: -1 })).toThrow(/buildCashPath: /);
    expect(() => buildCashPath({ ...base, asOf: '2026-02-30' })).toThrow(/buildCashPath: /);
  });
  it('property: no flows gives a non-increasing path and the exact total spread', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000_000 }), fc.integer({ min: -1_000_000, max: 1_000_000 }), (s, o) => {
        const p = buildCashPath({ ...base, opening: m(o), spreadMonthly: m(s) });
        for (let d = 1; d <= 90; d++) expect(p.balances[d]!).toBeLessThanOrEqual(p.balances[d - 1]!);
        expect(o - p.balances[90]!).toBe(Number(divideHalfUp(BigInt(s) * 12n * 91n, 365n)));
      })
    );
  });
});

describe('cashPathForSnapshot', () => {
  it('returns null with no confirmed income series', () => {
    const args = { money: moneyOf(300_000), spendingShare: SOLE_SPENDING, debtPayments: m(0) };
    expect(cashPathForSnapshot({ ...args, snapshot: snapshotOf() })).toBeNull();
    expect(
      cashPathForSnapshot({ ...args, snapshot: snapshotOf({ incomeSeries: [{ ...PAY, confirmed: false }] }) })
    ).toBeNull();
  });
  it('builds from cash on hand with pay on its dates and the spread', () => {
    const p = pathOf()!;
    expect(p.balances).toHaveLength(91);
    expect(p.balances[0]).toBe(2_000_000 - spreadUndatedSpending(m(320_000), 0));
    expect(p.balances[0]).toBe(1_989_479);
    expect(p.balances[14]! - p.balances[15]!).toBeLessThan(0); // pay arrives on day 15
    expect(p.balances[19]).toBe(2_389_589);
    expect(p.balances[20]).toBe(2_379_068);
    expect(p.balances[90]).toBe(2_842_630);
    // three pay days: 15, 46, 77
    expect(p.balances[45]! - p.balances[46]!).toBeLessThan(0);
    expect(p.balances[76]! - p.balances[77]!).toBeLessThan(0);
  });
  it('moves a yearly bill out of the spread onto its date', () => {
    const yearly = bill({
      seriesId: 'y',
      freq: 'yearly',
      anchorDate: '2025-09-01',
      lastPaidDate: '2025-09-01',
      latestAmount: 120_000,
    });
    const p = pathOf({ bills: [yearly] })!;
    const without = pathOf()!;
    // day 52 -> 53: the 120_000 lands on day 53
    const stepBefore = p.balances[52]! - p.balances[53]!;
    expect(stepBefore).toBeGreaterThan(120_000 - 100);
    expect(p.balances[0]).toBe(2_000_000 - spreadUndatedSpending(m(310_000), 0));
    expect(p.balances[90]).toBe(without.balances[90]! - 120_000 + (spreadUndatedSpending(m(320_000), 90) - spreadUndatedSpending(m(310_000), 90)));
  });
  it('moves a monthly bill out of the spread and floors the spread at 0', () => {
    const monthly = bill({
      seriesId: 'rent',
      freq: 'monthly',
      anchorDate: '2026-01-28',
      lastPaidDate: '2026-06-28',
      latestAmount: 50_000,
    });
    const p = pathOf({ bills: [monthly] })!;
    expect(p.balances[0]).toBe(2_000_000 - spreadUndatedSpending(m(270_000), 0));
    const big = bill({
      seriesId: 'big',
      freq: 'monthly',
      anchorDate: '2026-01-28',
      lastPaidDate: '2026-06-28',
      latestAmount: 400_000,
    });
    const q = cashPathForSnapshot({
      snapshot: snapshotOf({ incomeSeries: [PAY], bills: [big] }),
      money: moneyOf(300_000),
      spendingShare: SOLE_SPENDING,
      debtPayments: m(0),
    })!;
    expect(q.balances[0]).toBe(2_000_000);
    expect(q.balances[14]).toBe(2_000_000);
  });
  it('ignores an unconfirmed bill', () => {
    const b = bill({ seriesId: 'u', freq: 'monthly', anchorDate: '2026-01-28', latestAmount: 50_000, confirmed: false });
    expect(pathOf({ bills: [b] })!.balances).toEqual(pathOf()!.balances);
  });
  it('shares bills but never pay', () => {
    const yearly = bill({
      seriesId: 'y',
      freq: 'yearly',
      anchorDate: '2025-09-01',
      lastPaidDate: '2025-09-01',
      latestAmount: 120_000,
    });
    const p = pathOf({ bills: [yearly] }, EVEN_SPENDING)!;
    const step = p.balances[52]! - p.balances[53]!;
    expect(step).toBeGreaterThan(60_000);
    expect(step).toBeLessThan(60_000 + 11_000); // plus one day of the spread, not the unshared 120_000
    // pay still arrives in full on day 15
    expect(p.balances[15]! - p.balances[14]!).toBeGreaterThan(580_000);
  });
  it('places scheduled outflows on their dates (D-61)', () => {
    const base = pathOf()!;
    const ahead = pathOf({ scheduledOutflows: [outflow({ id: 'o_ahead', date: '2026-07-30', amount: 50_000 })] })!;
    for (let d = 0; d < 20; d++) expect(ahead.balances[d]).toBe(base.balances[d]);
    expect(ahead.balances[20]).toBe(2_329_068);
    for (let d = 20; d <= 90; d++) expect(ahead.balances[d]).toBe(base.balances[d]! - 50_000);

    for (const date of ['2026-07-07', '2026-07-10']) {
      const past = pathOf({ scheduledOutflows: [outflow({ id: 'o_past', date, amount: 50_000 })] })!;
      expect(past.balances[0]).toBe(1_939_479);
      for (let d = 0; d <= 90; d++) expect(past.balances[d]).toBe(base.balances[d]! - 50_000);
    }

    const edge = pathOf({ scheduledOutflows: [outflow({ id: 'o_edge', date: '2026-10-08', amount: 50_000 })] })!;
    for (let d = 0; d < 90; d++) expect(edge.balances[d]).toBe(base.balances[d]);
    expect(edge.balances[90]).toBe(2_792_630);

    const beyond = pathOf({ scheduledOutflows: [outflow({ id: 'o_far', date: '2026-10-09', amount: 50_000 })] })!;
    expect(beyond.balances).toEqual(base.balances);
  });
  it('does not re-share a scheduled outflow (D-61)', () => {
    const base = pathOf({}, EVEN_SPENDING)!;
    const withO = pathOf({ scheduledOutflows: [outflow({ id: 'o', date: '2026-07-30', amount: 50_000 })] }, EVEN_SPENDING)!;
    expect(base.balances[30]! - withO.balances[30]!).toBe(50_000);
  });
  it('gives no path without income even with outflows', () => {
    expect(
      cashPathForSnapshot({
        snapshot: snapshotOf({ scheduledOutflows: [outflow({ id: 'o', date: ASOF, amount: 5 })] }),
        money: moneyOf(0),
        spendingShare: SOLE_SPENDING,
        debtPayments: m(0),
      })
    ).toBeNull();
  });
  it('rejects mixed currencies and bad data', () => {
    const cad = currencyCode('CAD');
    expect(() => pathOf({ scheduledOutflows: [outflow({ id: 'o', date: ASOF, amount: 5, currency: cad })] })).toThrow(
      /^cashPathForSnapshot: mixed currencies/
    );
    expect(() => pathOf({ incomeSeries: [{ ...PAY, currency: cad }] })).toThrow(/^cashPathForSnapshot: mixed currencies/);
    expect(() => pathOf({ incomeSeries: [{ ...PAY, freq: 'daily' as RecurringFreq }] })).toThrow(RangeError);
    expect(() => pathOf({ scheduledOutflows: [outflow({ id: 'o', date: ASOF, amount: 0 })] })).toThrow(
      /^scheduledOutflowsDue: /
    );
    const cadBill = bill({ seriesId: 'b', freq: 'monthly', anchorDate: '2026-01-28', latestAmount: 5, currency: cad });
    expect(() => pathOf({ bills: [cadBill] })).toThrow(/^cashPathForSnapshot: mixed currencies/);
  });
});

function planOf(over: Partial<Plan>): Plan {
  return {
    price: m(0),
    dayOne: m(0),
    monthly: m(0),
    months: 0,
    financed: m(0),
    total: m(0),
    interest: m(0),
    dayFees: m(0),
    card: null,
    finalMonthly: null,
    impliedAnnualRate: null,
    paymentSteps: [],
    promo: null,
    lateFees: null,
    ...over,
  } as Plan;
}

describe('purchaseFlows', () => {
  const run = (plan: Plan, runningNet = 0, share = SOLE_SHARE, asOf = ASOF) =>
    purchaseFlows({ plan, runningNet: m(runningNet), share, asOf, days: 90 });
  const loan = planOf({
    dayOne: m(300_000),
    paymentSteps: [
      { fromMonth: 1, toMonth: 47, amount: m(25_000) },
      { fromMonth: 48, toMonth: 48, amount: m(25_010) },
    ],
  });
  it('lists the day-one cost and monthly payments inside the window', () => {
    expect(run(loan)).toEqual([
      { date: '2026-07-10', amount: 300_000 },
      { date: '2026-08-10', amount: 25_000 },
      { date: '2026-09-10', amount: 25_000 },
    ]);
  });
  it('adds running costs to each monthly date', () => {
    expect(run(loan, 5_500).map((f) => f.amount)).toEqual([300_000, 30_500, 30_500]);
    const cash = planOf({ dayOne: m(180_000) });
    expect(run(cash, 5_500)).toEqual([
      { date: '2026-07-10', amount: 180_000 },
      { date: '2026-08-10', amount: 5_500 },
      { date: '2026-09-10', amount: 5_500 },
    ]);
  });
  it('allows negative monthly flows and empty plans', () => {
    expect(run(planOf({ dayOne: m(100) }), -3_000).map((f) => f.amount)).toEqual([100, -3_000, -3_000]);
    expect(run(planOf({}), 0)).toEqual([]);
  });
  it('handles instalments', () => {
    const inst = planOf({ dayOne: m(62_000), paymentSteps: [{ fromMonth: 1, toMonth: 23, amount: m(62_000) }] });
    expect(run(inst).map((f) => f.amount)).toEqual([62_000, 62_000, 62_000]);
  });
  it('takes my share', () => {
    expect(run(loan, 0, EVEN2).map((f) => f.amount)).toEqual([150_000, 12_500, 12_500]);
  });
  it('clamps month ends', () => {
    expect(run(loan, 0, SOLE_SHARE, '2026-01-31').map((f) => f.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });
  it('stops a step that ends early', () => {
    const p = planOf({ paymentSteps: [{ fromMonth: 1, toMonth: 1, amount: m(10_000) }] });
    expect(run(p)).toEqual([{ date: '2026-08-10', amount: 10_000 }]);
  });
});

describe('applyOutflows / lowestPoint / cashPathReport', () => {
  const flat: CashPathBase = { asOf: ASOF, balances: Array.from({ length: 91 }, () => m(1_000)) };
  it('subtracts flows from their day onward without mutating', () => {
    const out = applyOutflows(flat, [
      { date: ASOF, amount: m(100) },
      { date: '2026-07-12', amount: m(50) },
    ]);
    expect(out.balances.slice(0, 4)).toEqual([900, 900, 850, 850]);
    expect(flat.balances[0]).toBe(1_000);
  });
  it('rejects flows outside the path', () => {
    expect(() => applyOutflows(flat, [{ date: '2026-10-09', amount: m(1) }])).toThrow(/applyOutflows: /);
    expect(() => applyOutflows(flat, [{ date: '2026-07-09', amount: m(1) }])).toThrow(/applyOutflows: /);
  });
  it('property: non-negative flows never raise the path', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ day: fc.integer({ min: 0, max: 90 }), amount: fc.integer({ min: 0, max: 1e6 }) }), {
          maxLength: 8,
        }),
        (flows) => {
          const out = applyOutflows(
            flat,
            flows.map((f) => ({ date: addDays(ASOF, f.day), amount: m(f.amount) }))
          );
          for (let d = 0; d <= 90; d++) expect(out.balances[d]!).toBeLessThanOrEqual(flat.balances[d]!);
        }
      )
    );
  });
  it('finds the earliest lowest point', () => {
    expect(lowestPoint({ asOf: ASOF, balances: [m(5), m(3), m(3), m(4)] })).toEqual({
      day: 1,
      date: addDays(ASOF, 1),
      amount: 3,
    });
  });
  it('reports unavailable and available', () => {
    expect(cashPathReport(null, null, m(0))).toEqual({ status: 'unavailable', code: 'cash_path_unavailable' });
    const without: CashPathBase = { asOf: ASOF, balances: [m(100), m(50), m(200)] };
    const withP = applyOutflows(without, [{ date: ASOF, amount: m(10) }]);
    const r = cashPathReport(without, withP, m(60));
    expect(r).toMatchObject({
      status: 'available',
      withoutPurchase: [100, 50, 200],
      withPurchase: [90, 40, 190],
      lowestWithout: { day: 1, amount: 50 },
      lowestWith: { day: 1, amount: 40 },
      tightBeforePayday: { code: 'cash_tight_before_payday', amount: 50, date: addDays(ASOF, 1) },
    });
    expect(() => cashPathReport(without, null, m(0))).toThrow(RangeError);
    expect(() => cashPathReport(null, withP, m(0))).toThrow(RangeError);
  });
});

describe('cashTightFact (basis fact)', () => {
  const pt = (amount: number) => ({ day: 14, date: '2026-07-24', amount: m(amount) });
  it('flags a low below zero or below the reserve', () => {
    expect(cashTightFact(pt(-52_192), m(0))).toEqual({
      code: 'cash_tight_before_payday',
      date: '2026-07-24',
      amount: -52_192,
    });
    expect(cashTightFact(pt(197_808), m(200_000))).toEqual({
      code: 'cash_tight_before_payday',
      date: '2026-07-24',
      amount: 197_808,
    });
  });
  it('is null at or above the reserve', () => {
    expect(cashTightFact(pt(200_000), m(200_000))).toBeNull();
    expect(cashTightFact(pt(1_797_808), m(600_000))).toBeNull();
  });
  it('rejects a negative reserve', () => {
    expect(() => cashTightFact(pt(1), m(-1))).toThrow(/cashTightFact: /);
  });
});

describe('classifyCashDip / dipShortfall / cashPathMargin (one card per cause)', () => {
  const inp = (lowestWith: number, lowestWithout: number, reserve: number, cashAfter: number, cashOnHand = 1_000_000): CashDipInput => ({
    lowestWith: m(lowestWith),
    lowestWithout: m(lowestWithout),
    reserve: m(reserve),
    cashAfter: m(cashAfter),
    cashOnHand: m(cashOnHand),
  });
  it.each([
    [inp(550_000, 800_000, 600_000, 700_000), { severity: 'soft', shortfall: 50_000 }],
    [inp(-10_000, 800_000, 600_000, 700_000), { severity: 'hard', shortfall: 610_000 }],
    [inp(500_000, 800_000, 600_000, 500_000), null],
    [inp(450_000, 800_000, 600_000, 500_000), { severity: 'soft', shortfall: 50_000 }],
    [inp(650_000, 800_000, 600_000, 700_000), null],
    [inp(-5, 800_000, 0, 10), { severity: 'hard', shortfall: 5 }],
    [inp(-100, 800_000, 0, -100), null],
    [inp(-152_192, -52_192, 0, 50_000, 150_000), { severity: 'hard', shortfall: 100_000 }],
    [inp(97_808, 197_808, 200_000, 300_000, 400_000), { severity: 'soft', shortfall: 100_000 }],
    [inp(350_000, 450_000, 600_000, 500_000, 500_000), { severity: 'soft', shortfall: 100_000 }],
    [inp(300_000, 450_000, 600_000, 450_000, 500_000), { severity: 'soft', shortfall: 100_000 }],
    [inp(450_000, 450_000, 600_000, 700_000), null],
    [inp(-52_192, -52_192, 0, 150_000, 150_000), null],
    [inp(500_000, 450_000, 600_000, 700_000), null],
    [inp(-195_000, 5_000, 600_000, 100_000, 300_000), { severity: 'hard', shortfall: 195_000 }],
  ])('classifies %#', (input, expected) => {
    expect(classifyCashDip(input)).toEqual(expected);
    expect(dipShortfall(input)).toBe(expected === null ? 0 : expected.shortfall);
    expect(cashPathMargin(input) < 0).toBe(expected !== null);
  });

  it.each([
    [inp(550_000, 800_000, 600_000, 700_000), -50_000],
    [inp(350_000, 450_000, 600_000, 500_000, 500_000), -100_000],
    [inp(-52_192, -52_192, 0, 150_000, 150_000), 0],
    [inp(450_000, 450_000, 600_000, 700_000), 0],
    [inp(1_697_808, 1_797_808, 600_000, 1_900_000, 2_000_000), 1_097_808],
    [inp(1_797_808, 1_797_808, 600_000, 2_000_000, 2_000_000), 1_197_808],
  ])('margin %#', (input, expected) => {
    expect(cashPathMargin(input)).toBe(expected);
  });

  it('rejects a negative reserve', () => {
    expect(() => dipShortfall(inp(1, 1, -1, 1))).toThrow(/^dipShortfall: /);
    expect(() => cashPathMargin(inp(1, 1, -1, 1))).toThrow(/^cashPathMargin: /);
    expect(() => dipShortfall({ ...inp(1, 1, 1, 1), cashOnHand: 1.5 as never })).toThrow();
  });

  const arb = fc
    .record({
      lowestWith: fc.integer({ min: -2_000_000, max: 2_000_000 }),
      lowestWithout: fc.integer({ min: -2_000_000, max: 2_000_000 }),
      reserve: fc.integer({ min: 0, max: 1_000_000 }),
      cashOnHand: fc.integer({ min: -500_000, max: 2_000_000 }),
      dayOne: fc.integer({ min: 0, max: 1_500_000 }),
    })
    .map((r) => ({ r, x: inp(r.lowestWith, r.lowestWithout, r.reserve, r.cashOnHand - r.dayOne, r.cashOnHand) }));

  it('property: bounds and classification agree', () => {
    fc.assert(
      fc.property(arb, ({ r, x }) => {
        const s = dipShortfall(x);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(Math.max(0, r.lowestWithout - r.lowestWith));
        const c = classifyCashDip(x);
        expect(c === null).toBe(s === 0);
        if (c !== null) expect(c.severity === 'hard').toBe(r.lowestWith < 0);
        if (r.lowestWith < 0 && r.lowestWith < r.lowestWithout && r.cashOnHand - r.dayOne >= 0) {
          expect(c?.severity).toBe('hard');
        }
        const margin = cashPathMargin(x);
        expect(Math.max(0, -margin)).toBe(s);
        expect(margin >= 0).toBe(c === null);
      })
    );
  });
  it('property: one card per cause and no pre-existing gap subtraction', () => {
    fc.assert(
      fc.property(arb, ({ r, x }) => {
        const cashAfter = r.cashOnHand - r.dayOne;
        const purchaseGap = Math.max(0, Math.min(r.reserve, r.cashOnHand) - cashAfter);
        if (r.lowestWithout >= r.reserve && r.lowestWith >= 0) {
          expect(purchaseGap + dipShortfall(x)).toBe(Math.max(purchaseGap, Math.max(0, r.reserve - r.lowestWith)));
        }
        if (r.dayOne === 0 && r.lowestWith >= 0) {
          expect(dipShortfall(x)).toBe(Math.max(0, Math.min(r.reserve, r.lowestWithout) - r.lowestWith));
        }
      })
    );
  });
});
