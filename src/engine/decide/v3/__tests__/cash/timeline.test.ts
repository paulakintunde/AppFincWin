/**
 * 06.1 UX-38 (D55 "Every date, next 90 days"): the labelled 90-day list. It reads the flows the cash check sums, so its lowest
 * point is the engine's own cash.lowest; everyday spending is spread, never a line.
 */
import * as fc from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { applyPurchaseFlows, FLOW_KINDS, openCashFlows, openCashPath, purchaseFlows, type OpenCashPathInput } from '../../cash/path';
import { cashTimeline } from '../../cash/timeline';
import { replacesFlowsLabelled, replacesOutflows, type ReplacesEffect } from '../../fullCost/replaces';
import { purchaseCashFlows } from '../../judge/purchase';
import { judgeCheck, prepare } from '../../prepare';
import type { V3Inputs } from '../../types';
import { checkOnce, checkPlan, inputsOf, monthOf, v3Line, v3Series } from '../helpers/fixtures';
import { fcRuns } from '../helpers/fcRuns';
import { checkArb, inputsArb, overdraftInputsArb, withOverdraft } from '../invariants/arbitraries';

const mu = minorUnits;
const MONTHLY = { unit: 'month', every: 1 } as const;

function sam(over: Partial<V3Inputs> = {}): V3Inputs {
  const months = ['2026-07', '2026-08', '2026-09'].map((m) =>
    monthOf(m, [
      v3Line({ id: `p-${m}`, date: `${m}-25`, amount: 300_000, role: 'income', seriesId: 'pay' }),
      v3Line({ id: `e-${m}`, date: `${m}-12`, amount: 90_000 }),
    ])
  );
  return inputsOf({
    months: [...months, monthOf('2026-10', [], { full: false })],
    series: [
      v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2026-01-25', amount: 300_000 }),
      v3Series({ id: 'rent', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-25', amount: 120_000 }),
      v3Series({ id: 'save', role: 'saving', cadence: MONTHLY, anchorDate: '2026-01-25', amount: 20_000, savingMode: 'fixed' }),
    ],
    debts: [{ id: 'loan', kind: 'loan', balance: mu(500_000), minimum: mu(10_000), apr: null, secured: false, isHousing: false, dueDay: 15 }],
    accounts: [{ id: 'main', balance: mu(200_000), use: { kind: 'everyday' }, kind: 'current' }],
    balance: mu(200_000),
    ...over,
  });
}

describe('UX-38 cashTimeline', () => {
  it('lists each dated flow with its label and the balance after it, ordered by date then kind', () => {
    const p = prepare(sam());
    const t = cashTimeline(p, checkOnce(50_000));
    expect(t.start).toBe(200_000);
    const first = t.rows[0];
    expect(first).toMatchObject({ date: '2026-10-03', amount: -50_000, kind: 'purchase', seriesId: null, debtId: null });
    const loan = t.rows.find((r) => r.kind === 'debt');
    expect(loan).toMatchObject({ date: '2026-10-15', amount: -10_000, debtId: 'loan', seriesId: null });
    // pay, rent and saving all fall on the 25th: pay first, then the bill, then the saving
    const on25 = t.rows.filter((r) => r.date === '2026-10-25');
    expect(on25.map((r) => [r.kind, r.seriesId])).toEqual([
      ['pay', 'pay'],
      ['bill', 'rent'],
      ['saving', 'save'],
    ]);
    expect((on25[0]?.balanceAfter as number) - (on25[1]?.balanceAfter as number)).toBe(120_000);
    // never an everyday spending line
    for (const r of t.rows) expect(FLOW_KINDS).toContain(r.kind);
    const e = judgeCheck(p, checkOnce(50_000));
    expect(e.cash.kind === 'ok' || e.cash.kind === 'overdraft' || e.cash.kind === 'net').toBe(true);
    if ('lowest' in e.cash) expect(t.lowest).toEqual(e.cash.lowest);
  });

  it('labels a plan payment and keeps two flows of one kind on one date in the path order', () => {
    const p = prepare(sam());
    const t = cashTimeline(p, checkPlan(240_000, { count: 12, apr: percent('0'), firstPayment: { kind: 'one_period' } }), 40);
    expect(t.rows.some((r) => r.kind === 'plan_payment')).toBe(true);
    const twice = sam({ series: [...sam().series, v3Series({ id: 'gym', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-25', amount: 4_000 })] });
    const rows = cashTimeline(prepare(twice), checkOnce(1_000), 30).rows.filter((r) => r.kind === 'bill' && r.date === '2026-10-25');
    expect(rows.map((r) => r.seriesId)).toEqual(['rent', 'gym']);
    expect(rows.every((r) => r.date < '2026-11-02')).toBe(true);
  });

  it('a shorter list stops at its last day; days outside 1..90 throw', () => {
    const p = prepare(sam());
    const t = cashTimeline(p, checkOnce(1_000), 10);
    expect(t.rows.every((r) => r.date < '2026-10-13')).toBe(true);
    expect(() => cashTimeline(p, checkOnce(1_000), 0)).toThrow(RangeError);
    expect(() => cashTimeline(p, checkOnce(1_000), 91)).toThrow(RangeError);
    expect(() => cashTimeline(p, checkOnce(1_000), 1.5)).toThrow(RangeError);
  });

  it('UX-38 the lowest point equals the engine cash check whenever it carries one (ok, overdraft, net)', () => {
    let seen = 0;
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const p = prepare(inputs);
        const e = judgeCheck(p, check);
        const t = cashTimeline(p, check);
        if (e.cash.kind === 'ok' || e.cash.kind === 'overdraft' || e.cash.kind === 'net') {
          seen++;
          expect(t.lowest).toEqual(e.cash.lowest);
        }
        let prev = '';
        for (const r of t.rows) {
          expect(r.date >= prev).toBe(true);
          expect(r.amount).not.toBe(0);
          prev = r.date;
        }
      }),
      { numRuns: fcRuns(200), seed: 0x0638 }
    );
    expect(seen).toBeGreaterThan(0);
    fc.assert(
      fc.property(overdraftInputsArb, checkArb, ({ base, o }, check) => {
        const p = prepare(withOverdraft(base, o));
        const e = judgeCheck(p, check);
        if ('lowest' in e.cash) expect(cashTimeline(p, check).lowest).toEqual(e.cash.lowest);
      }),
      { numRuns: fcRuns(80), seed: 0x0639 }
    );
  });
});

describe('UX-38 the list follows the reading the answer keeps (D-42)', () => {
  it('when the second reading is stricter, the list is read from it; otherwise from the first', () => {
    const rich = prepare(sam());
    const poor = prepare(sam({ accounts: [{ id: 'main', balance: mu(1_000), use: { kind: 'everyday' }, kind: 'current' }], balance: mu(1_000) }));
    const check = checkOnce(10_000);
    expect(judgeCheck(rich, check).result.code).not.toBe(judgeCheck(poor, check).result.code);
    const r1 = rich.readings[0] as (typeof rich.readings)[number];
    const r2 = poor.readings[0] as (typeof poor.readings)[number];
    const both = { ...rich, readings: [r1, r2] };
    expect(judgeCheck(both, check).result.code).toBe(judgeCheck(poor, check).result.code);
    expect(cashTimeline(both, check)).toEqual(cashTimeline({ ...rich, readings: [r2] }, check));
    expect(cashTimeline({ ...rich, readings: [r2, r1] }, check)).toEqual(cashTimeline(poor, check));
    expect(cashTimeline(both, check).start).not.toBe(cashTimeline(rich, check).start);
  });
});

describe('UX-38 labelled flows are the path flows with labels added', () => {
  const base: OpenCashPathInput = {
    asOf: '2026-10-03',
    days: 90,
    series: [v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2026-01-25', amount: 300_000 })],
    paidThisMonth: new Set(),
    erest: mu(10_000),
    e: mu(30_000),
  };

  it('a history pay is income with no series; a capped pay stays listed at what landed', () => {
    const { flows, capped } = openCashFlows({
      ...base,
      extraPays: [{ date: '2026-10-20', amount: mu(50_000) }],
      payCaps: new Map([['2026-10', mu(320_000)]]),
    });
    expect(flows.filter((f) => f.date.startsWith('2026-10')).map((f) => [f.kind, f.seriesId, f.amount])).toEqual([
      ['income', null, 50_000],
      ['pay', 'pay', 270_000],
    ]);
    expect(flows.filter((f) => f.date >= '2026-11-01').every((f) => f.amount === 0)).toBe(true);
    expect(capped).toBeGreaterThan(0n);
    expect(() => openCashFlows({ ...base, days: 0 })).toThrow(RangeError);
  });

  it('savings and debts with no id stay unlabelled by id; openCashPath sums the same flows', () => {
    const input = { ...base, savings: [{ date: '2026-10-10', amount: mu(1_000) }], debts: [{ date: '2026-10-11', amount: mu(2_000) }] };
    const { flows } = openCashFlows(input);
    expect(flows.find((f) => f.kind === 'saving')).toMatchObject({ seriesId: null, amount: -1_000 });
    expect(flows.find((f) => f.kind === 'debt')).toMatchObject({ debtId: null, amount: -2_000 });
    const path = applyPurchaseFlows(openCashPath(input), mu(0), []);
    const total = flows.filter((f) => f.date < '2027-01-01').reduce((s, f) => s + f.amount, 0);
    expect(path.points.length).toBe(90);
    expect(Number.isInteger(total)).toBe(true);
  });

  it('purchase and replaces flows drop their labels back to the exact old flows', () => {
    const share = { weights: [1], myIndex: 0 };
    expect(purchaseFlows({ dayOne: mu(0), schedule: null, share }, '2026-10-03', 90)).toEqual([]);
    expect(purchaseCashFlows({ dayOne: mu(500), schedule: null, share, runningCosts: [] }, '2026-10-03', 90)).toEqual([{ date: '2026-10-03', amount: 500 }]);
    const sale = { date: '2026-10-20', amount: mu(9_000) };
    const rep = { flows: [{ date: '2026-10-10', amount: mu(1_000) }, sale], saleNow: mu(3_000), saleDate: '2026-10-05', saleOnPath: sale } as unknown as ReplacesEffect;
    expect(replacesFlowsLabelled(rep, 1_000).map((f) => [f.kind, f.amount])).toEqual([
      ['stopped_cost', 1_000],
      ['sale', 9_000],
      ['sale', 2_000],
    ]);
    expect(replacesOutflows(rep, 1_000)).toEqual([
      { date: '2026-10-10', amount: -1_000 },
      { date: '2026-10-20', amount: -9_000 },
      { date: '2026-10-05', amount: -2_000 },
    ]);
    expect(replacesFlowsLabelled({ ...rep, saleOnPath: undefined } as ReplacesEffect, 3_000).map((f) => f.kind)).toEqual(['stopped_cost', 'stopped_cost']);
  });
});
