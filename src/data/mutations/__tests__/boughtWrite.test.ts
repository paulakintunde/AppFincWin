// 05.3-13 (DSV-13): golden suite for buildBoughtWrite. Fixed mint counter, frozen today.
import { buildBoughtWrite, isBoughtRefusal, type BoughtContext } from '../boughtWrite';
import type { Purchase, Schedule, Result } from '@/engine/decide/v3';

const TODAY = '2026-10-18';
const SOLE = { weights: [1], myIndex: 0 };
const HALF = { weights: [1, 1], myIndex: 0 };

const ctx: BoughtContext = {
  householdId: 'h1',
  currency: 'USD',
  timeZone: 'America/New_York',
  today: TODAY,
  cashAccountId: 'cash1',
  debtCategoryId: 'cat-debt',
  runningCostCategoryId: null,
  name: ' Sofa ',
  aprText: '7.5',
};

const result: Pick<Result, 'legacyState' | 'facts'> = { legacyState: 'fits', facts: [] };

function counter(): () => string {
  let n = 0;
  return () => `id-${++n}`;
}

function schedule(over: Record<string, unknown> = {}): Schedule {
  return {
    cadence: { unit: 'month', every: 1 },
    count: 36,
    payment: 30000,
    finalPayment: 30000,
    lastPaying: 36,
    firstDate: '2026-11-18',
    financed: 900000,
    pauseInterest: 0,
    totalPaid: 1080000,
    totalInterest: 180000,
    fees: { setup: 0, perPeriod: 0, end: 0 },
    monthlyEquivalent: 30000,
    source: 'computed',
    ...over,
  } as Schedule;
}

function purchase(over: Record<string, unknown> = {}): Purchase {
  return {
    whole: 100000,
    dayOne: 100000,
    monthly: 0,
    runningMonthly: 0,
    schedule: null,
    share: SOLE,
    itemType: 'furniture',
    purpose: null,
    emergency: false,
    canUseEmergency: false,
    band: 'mid',
    layers: [],
    financed: false,
    secured: false,
    categoryId: 'cat-home',
    envelopeId: null,
    ...over,
  } as unknown as Purchase;
}

const build = (p: Purchase | null, c: BoughtContext = ctx, r = result) =>
  buildBoughtWrite({ purchase: p, result: r, ctx: c, mint: counter() });

describe('buildBoughtWrite', () => {
  it('cash, once: one negative day-one row, no series, no debt', () => {
    const w = build(purchase());
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({
      id: 'id-1',
      account_id: 'cash1',
      original_amount: -100000,
      local_date: TODAY,
      category_id: 'cat-home',
      one_off: true,
      name: 'Sofa',
      status: 'pending',
    });
    expect(w.series).toEqual([]);
    expect(w.debt).toBeNull();
    expect(w.endSeries).toEqual([]);
    expect(w.decision).toMatchObject({
      verdict: 'fits',
      estimate_day_one: 100000,
      row_roles: ['day_one'],
      series_roles: [],
      broke_line: false,
      cooling_off: false,
    });
  });

  it('labels the rows in the context currency (home) on the everyday account, amounts unchanged', () => {
    const w = build(purchase(), { ...ctx, currency: 'USD', cashAccountId: 'acc-gbp' });
    expect(w.rows[0]).toMatchObject({ original_currency: 'USD', account_id: 'acc-gbp', original_amount: -100000 });
  });

  it('verdict is Result.legacyState and broke_line follows a line_crossed fact', () => {
    const w = build(purchase(), ctx, {
      legacyState: 'adjust',
      facts: [{ code: 'line_crossed', values: { lineId: 'x' } }],
    } as unknown as Result);
    expect(w.decision.verdict).toBe('adjust');
    expect(w.decision.broke_line).toBe(true);
  });

  it('loan (monthly, 36): day-one row, one payment series, debt row', () => {
    const w = build(purchase({ dayOne: 50000, monthly: 30000, financed: true, secured: true, schedule: schedule() }));
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]!.original_amount).toBe(-50000);
    expect(w.series).toHaveLength(1);
    expect(w.series[0]).toMatchObject({
      amount: -30000,
      freq: 'monthly',
      anchor_date: '2026-11-18',
      occurrence_count: 36,
      category_id: 'cat-debt',
    });
    expect(w.debt).toMatchObject({
      balance: 900000,
      apr: '7.5',
      minimum_payment: 30000,
      term_months: 36,
      secured: true,
      kind: 'loan',
      series_id: w.series[0]!.id,
    });
    expect(w.decision.series_roles).toEqual(['payment']);
    expect(w.decision.estimate_monthly_payment).toBe(30000);
  });

  it('a different last payment is written as its own row after a shorter series', () => {
    const w = build(
      purchase({ dayOne: 0, financed: true, schedule: schedule({ count: 12, lastPaying: 12, finalPayment: 21234 }) })
    );
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ original_amount: -21234, local_date: '2027-10-18' });
    expect(w.series[0]!.occurrence_count).toBe(11);
    expect(w.decision.row_roles).toEqual(['payment']);
  });

  it('a first payment dated today is inside day one, so the series starts at the second', () => {
    const w = build(purchase({ dayOne: 30000, financed: true, schedule: schedule({ firstDate: TODAY, lastPaying: 6, count: 6 }) }));
    expect(w.series[0]).toMatchObject({ anchor_date: '2026-11-18', occurrence_count: 5 });
  });

  it('weekly and every-2-weeks map to weekly and fortnightly', () => {
    const wk = build(purchase({ dayOne: 0, financed: true, schedule: schedule({ cadence: { unit: 'week', every: 1 }, firstDate: '2026-10-25', lastPaying: 8, count: 8 }) }));
    expect(wk.series[0]).toMatchObject({ freq: 'weekly', anchor_date: '2026-10-25', occurrence_count: 8 });
    expect(wk.debt!.term_months).toBeNull();
    const bi = build(purchase({ dayOne: 0, financed: true, schedule: schedule({ cadence: { unit: 'week', every: 2 }, lastPaying: 8, count: 8 }) }));
    expect(bi.series[0]!.freq).toBe('fortnightly');
  });

  it('refuses a cadence that has no recurring frequency', () => {
    expect(() => build(purchase({ financed: true, schedule: schedule({ cadence: { unit: 'month', every: 2 } }) }))).toThrow();
    try {
      build(purchase({ financed: true, schedule: schedule({ cadence: { unit: 'month', every: 2 } }) }));
    } catch (e) {
      expect(isBoughtRefusal(e)).toBe(true);
    }
  });

  it('running costs write a monthly running_cost series, category falling back to the purchase', () => {
    const a = build(purchase({ runningMonthly: 4500 }));
    expect(a.series).toHaveLength(1);
    expect(a.series[0]).toMatchObject({ amount: -4500, freq: 'monthly', occurrence_count: null, category_id: 'cat-home' });
    expect(a.decision.series_roles).toEqual(['running_cost']);
    expect(a.decision.estimate_running).toBe(4500);
    const b = build(purchase({ runningMonthly: 4500 }), { ...ctx, runningCostCategoryId: 'cat-run' });
    expect(b.series[0]!.category_id).toBe('cat-run');
  });

  it('household half share: the debt and payments hold my part; day one is Purchase.dayOne', () => {
    const w = build(
      purchase({
        share: HALF,
        dayOne: 25000,
        financed: true,
        schedule: schedule({ payment: 30001, finalPayment: 30001, financed: 900001 }),
      })
    );
    expect(w.rows[0]!.original_amount).toBe(-25000);
    // allocate gives the first member the extra cent on an odd split
    expect(Math.abs(w.series[0]!.amount)).toBe(15001);
    expect(w.debt!.balance).toBe(450001);
    expect(w.debt!.minimum_payment).toBe(15001);
  });

  it('refusals', () => {
    const cases: (() => unknown)[] = [
      () => build(null),
      () => build(purchase(), { ...ctx, cashAccountId: null }),
      () => build(purchase({ dayOne: 1.5 })),
      () => build(purchase({ dayOne: Number.MAX_SAFE_INTEGER + 2 })),
      () => build(purchase({ financed: true, schedule: schedule() }), { ...ctx, debtCategoryId: null }),
    ];
    for (const run of cases) {
      let caught: unknown;
      try {
        run();
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeDefined();
      expect(isBoughtRefusal(caught)).toBe(true);
    }
  });

  it('isBoughtRefusal is false for ordinary errors', () => {
    expect(isBoughtRefusal(new Error('x'))).toBe(false);
    expect(isBoughtRefusal('x')).toBe(false);
  });
});
