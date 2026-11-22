// 08.1-12 (ARC-24, D-12): a Household purchase is written as shared money at its FULL amount. The share is applied only by Phase 8's
// readers (T-08.1-32). The client writes the same rows whichever account pays: a joint account makes no owing and a personal one follows
// the Phase 8 owing rule, both on the server (pgTAP 112), so the cases below are household/joint-or-personal alike and just-me.
import { evaluate } from '@/engine/decide/v3';
import type { CheckV2, RunningCostLine } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money/types';
import { percent } from '@/engine/payoff/types';
import { checkOnce, checkPlan, inputsOf } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { goAheadInputOfV3, type GoAheadV3Context } from '../decideGoAhead';

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'uuid') }));

const mu = minorUnits;
let n = 0;
const ctx = (over: Partial<GoAheadV3Context> = {}): GoAheadV3Context => ({
  householdId: 'h1',
  currency: 'USD',
  timeZone: 'UTC',
  today: '2026-10-03',
  name: 'Sofa',
  mint: () => `m-${++n}`,
  ...over,
});
beforeEach(() => {
  n = 0;
});

const evenTwo: CheckV2['share'] = { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } };
const weighted: CheckV2['share'] = { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [3, 1] } };
const mineOnly: CheckV2['share'] = { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'mine' } };
const inputs = inputsOf({ balance: mu(50000000) });
const line = (id: string, amount: number, over: Partial<RunningCostLine> = {}): RunningCostLine => ({ id, amount: mu(amount), everyMonths: 1, start: '2026-10-03', end: null, on: true, ...over });

describe('Household, cash purchase', () => {
  const check = checkOnce(100001, { share: evenTwo });
  const ev = evaluate(inputs, check);

  it('writes one shared line at the full amount, not my share', () => {
    const w = goAheadInputOfV3(check, ev, 'acc1', ctx());
    expect(ev.purchase?.whole).toBeLessThan(100001); // my part is the smaller figure
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ original_amount: -(ev.purchase?.full?.whole ?? 0), is_shared: true, one_off: true });
    expect(-(w.rows[0]?.original_amount ?? 0)).toBeGreaterThanOrEqual(100001); // price plus any tax or fees: never half
  });

  it('the share is applied once: the shared amount is exactly the sum of both people\'s parts', () => {
    const full = ev.purchase?.full?.whole ?? 0;
    const mine = ev.purchase?.whole ?? 0;
    // an even split of an odd amount: mine is the larger or smaller half, never the whole
    expect(mine * 2 - full).toBeGreaterThanOrEqual(-1);
    expect(mine * 2 - full).toBeLessThanOrEqual(1);
    expect(goAheadInputOfV3(check, ev, 'acc1', ctx()).rows[0]?.original_amount).toBe(-full);
  });

  it('a weighted split still writes the full amount', () => {
    const c = checkOnce(100001, { share: weighted });
    const e = evaluate(inputs, c);
    const w = goAheadInputOfV3(c, e, 'acc1', ctx());
    expect(w.rows[0]?.original_amount).toBe(-(e.purchase?.full?.whole ?? 0));
    expect(e.purchase?.full?.whole).toBeGreaterThan(e.purchase?.whole ?? 0);
  });

  it('a "mine" rule has no split, so whole is already the full amount; the line is still shared', () => {
    const c = checkOnce(100001, { share: mineOnly });
    const e = evaluate(inputs, c);
    expect(e.purchase?.full).toBeUndefined();
    const w = goAheadInputOfV3(c, e, 'acc1', ctx());
    expect(w.rows[0]).toMatchObject({ original_amount: -(e.purchase?.whole ?? 0), is_shared: true });
  });

  it('the account is only the account: a joint or a personal one gives the same rows (the server decides owing)', () => {
    const a = goAheadInputOfV3(check, ev, 'joint-acc', ctx());
    const b = goAheadInputOfV3(check, ev, 'personal-acc', ctx());
    expect(a.rows.map((r) => ({ ...r, id: '', account_id: '' }))).toEqual(b.rows.map((r) => ({ ...r, id: '', account_id: '' })));
    expect(a.rows[0]?.account_id).toBe('joint-acc');
    expect(b.rows[0]?.account_id).toBe('personal-acc');
  });

  it('running costs become shared bills at their full amount; a varying one is a shared expected line', () => {
    const w = goAheadInputOfV3(check, ev, 'acc1', ctx(), {
      runningCosts: [
        { line: line('rc:insurance', 14000), name: 'Insurance' },
        { line: line('rc:fuel', 12000, { varies: true }), name: 'Fuel' },
      ],
    });
    expect(w.series).toHaveLength(2);
    expect(w.series[0]).toMatchObject({ amount: -14000, is_shared: true });
    expect(w.series[0]?.amount_kind).toBeUndefined();
    expect(w.series[1]).toMatchObject({ amount: -12000, is_shared: true, amount_kind: 'expected' });
  });
});

describe('Household, plan purchase', () => {
  const plan = (share: CheckV2['share']): CheckV2 =>
    checkPlan(120001, { cadence: { unit: 'month', every: 1 }, count: 12, apr: percent('0'), deposit: mu(20001), firstPayment: { kind: 'one_period' } }, { share });
  const check = plan(evenTwo);
  const ev = evaluate(inputs, check);

  it('the up-front row and the payment series are shared at the full lender amounts', () => {
    const w = goAheadInputOfV3(check, ev, 'acc1', ctx());
    const sched = ev.purchase?.schedule;
    expect(sched).not.toBeNull();
    expect(w.rows[0]).toMatchObject({ original_amount: -(ev.purchase?.full?.dayOne ?? 0), is_shared: true });
    expect(ev.purchase?.full?.dayOne).toBeGreaterThan(ev.purchase?.dayOne ?? 0);
    const regular = sched?.payment ?? 0;
    expect(w.series[0]).toMatchObject({ amount: -regular, is_shared: true });
  });

  it('just me: the same plan writes my part only and nothing is shared', () => {
    const solo = plan({ kind: 'personal' });
    const e = evaluate(inputs, solo);
    const w = goAheadInputOfV3(solo, e, 'acc1', ctx());
    expect(w.rows.every((r) => r.is_shared === undefined)).toBe(true);
    expect(w.series.every((s) => s.is_shared === undefined)).toBe(true);
    expect(w.rows[0]?.original_amount).toBe(-(e.purchase?.dayOne ?? 0));
    expect(e.purchase?.full).toBeUndefined();
  });
});

describe('Just me, cash purchase (as plan 09 writes it)', () => {
  it('writes my part only, with no shared flag', () => {
    const check = checkOnce(100001, { share: { kind: 'personal' } });
    const ev = evaluate(inputs, check);
    const w = goAheadInputOfV3(check, ev, 'acc1', ctx(), { runningCosts: [{ line: line('rc:insurance', 14000), name: 'Insurance' }] });
    expect(w.rows[0]?.original_amount).toBe(-(ev.purchase?.whole ?? 0));
    expect('is_shared' in (w.rows[0] ?? {})).toBe(false);
    expect('is_shared' in (w.series[0] ?? {})).toBe(false);
  });
});
