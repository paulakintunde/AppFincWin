// 08.1-09 (ARC-24, D-09..D-11): the one Record-as-bought writer. Stops end bills, running costs become bills or expected lines,
// sale / payoff / goal close ride in the same save, and only the ticked parts are written.
import { evaluate } from '@/engine/decide/v3';
import type { RunningCostLine, StoppedCost } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money/types';
import { checkOnce, inputsOf } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import { endSeriesOf, goAheadInputOfV3, type GoAheadV3Context } from '../decideGoAhead';

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'uuid') }));

const mu = minorUnits;
let n = 0;
const ctx = (over: Partial<GoAheadV3Context> = {}): GoAheadV3Context => ({
  householdId: 'h1',
  currency: 'USD',
  timeZone: 'UTC',
  today: '2026-10-03',
  name: 'Car',
  mint: () => `m-${++n}`,
  ...over,
});
beforeEach(() => {
  n = 0;
});

const check = checkOnce(100000, { categoryId: 'cat-transport' });
const ev = evaluate(inputsOf({ balance: mu(5000000) }), check);
const line = (id: string, amount: number, over: Partial<RunningCostLine> = {}): RunningCostLine => ({ id, amount: mu(amount), everyMonths: 1, start: '2026-10-03', end: null, on: true, ...over });

describe('costs that stop (ARC-23, endSeriesOf)', () => {
  const bill = (id: string, stopDate: string): StoppedCost =>
    ({ id: `s-${id}`, amount: 8000, everyMonths: 1, stopDate, source: { kind: 'bill', seriesId: id } }) as StoppedCost;
  const everyday = { id: 'e1', amount: 5000, everyMonths: 1, stopDate: '2026-11-20', source: { kind: 'everyday', categoryId: null } } as StoppedCost;
  const gym = { id: 'gym', version: 4, anchor_date: '2026-01-05', end_date: null };

  it('a stopping bill ends the day before its stop date with end_reason stopped', () => {
    expect(endSeriesOf([bill('gym', '2026-11-20')], [gym])).toEqual([{ id: 'gym', expected_version: 4, end_date: '2026-11-19', end_reason: 'stopped' }]);
  });
  it('the save carries it in endSeries', () => {
    const w = goAheadInputOfV3(check, ev, 'acc1', ctx(), { stops: [bill('gym', '2026-11-20')], recorded: [gym] });
    expect(w.endSeries).toHaveLength(1);
    expect(w.endSeries[0]).toMatchObject({ id: 'gym', end_reason: 'stopped' });
  });
  it('an everyday stop writes no series change; nothing passed ends nothing', () => {
    expect(endSeriesOf([everyday], [gym])).toEqual([]);
    expect(endSeriesOf(undefined, undefined)).toEqual([]);
    expect(goAheadInputOfV3(check, ev, 'acc1', ctx()).endSeries).toEqual([]);
  });
  it('a bill already ended on or before that day is not written again; an unrecorded bill is skipped', () => {
    expect(endSeriesOf([bill('gym', '2026-11-20')], [{ ...gym, end_date: '2026-11-10' }])).toEqual([]);
    expect(endSeriesOf([bill('nope', '2026-11-20')], [gym])).toEqual([]);
    expect(endSeriesOf([bill('gym', '2026-11-20')], undefined)).toEqual([]);
  });
  it('the same bill named twice ends once; a stop before the anchor ends on the anchor', () => {
    expect(endSeriesOf([bill('gym', '2026-11-20'), bill('gym', '2026-12-20')], [gym])).toHaveLength(1);
    expect(endSeriesOf([bill('gym', '2026-01-01')], [gym])[0]?.end_date).toBe('2026-01-05');
  });
});

describe('running costs (D-09)', () => {
  it('a fixed cost becomes an exact bill series; a varying one becomes an expected series; neither is a transaction', () => {
    const w = goAheadInputOfV3(check, ev, 'acc1', ctx(), {
      runningCosts: [
        { line: line('rc:insurance', 14000), name: 'Insurance' },
        { line: line('rc:fuel', 12000, { varies: true }), name: 'Fuel or charging' },
      ],
    });
    expect(w.rows).toHaveLength(1); // the purchase only
    expect(w.series).toHaveLength(2);
    expect(w.series[0]).toMatchObject({ name: 'Car Insurance', amount: -14000, category_id: 'cat-transport', account_id: 'acc1' });
    expect(w.series[0]?.amount_kind).toBeUndefined();
    expect(w.series[1]).toMatchObject({ name: 'Car Fuel or charging', amount: -12000, amount_kind: 'expected' });
    expect(w.decision.series_roles).toEqual(['running_cost', 'running_cost']);
  });
  it('a line that is off or has no amount writes nothing', () => {
    const w = goAheadInputOfV3(check, ev, 'acc1', ctx(), { runningCosts: [{ line: line('a', 100, { on: false }), name: 'A' }, { line: line('b', 0), name: 'B' }] });
    expect(w.series).toEqual([]);
    expect(w.decision.series_roles).toEqual([]);
  });
  it('more series than one save may carry is refused as a refusal, not a bug', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ line: line(`l${i}`, 100), name: `L${i}` }));
    expect(() => goAheadInputOfV3(check, ev, 'acc1', ctx(), { runningCosts: many })).toThrow(RangeError);
  });
});

describe('sale, payoff and goal close (D-10, D-11)', () => {
  it('nothing ticked writes none of them', () => {
    const w = goAheadInputOfV3(check, ev, 'acc1', ctx());
    expect([w.sale, w.payoff, w.goalClose]).toEqual([null, null, null]);
  });
  it('the sale is money in on the chosen account and day; with the payoff ticked it names the loan too', () => {
    const w = goAheadInputOfV3(check, ev, 'acc1', ctx({ date: '2026-09-30' }), {
      sale: { amount: 900000, name: 'Old car' },
      payoff: { amount: 600000, name: 'Old car loan', debtId: 'debt1', version: 3 },
    });
    expect(w.sale).toMatchObject({ account_id: 'acc1', amount: 900000, currency: 'USD', local_date: '2026-09-30', name: 'Old car', debt_id: 'debt1', expected_version: 3 });
    expect(w.payoff).toMatchObject({ account_id: 'acc1', amount: 600000, debt_id: 'debt1', expected_version: 3, name: 'Old car loan' });
    expect(w.sale?.id).not.toBe(w.payoff?.id);
  });
  it('a sale alone names no loan', () => {
    const w = goAheadInputOfV3(check, ev, 'acc1', ctx(), { sale: { amount: 900000, name: 'Old car' } });
    expect(w.sale?.debt_id).toBeUndefined();
    expect(w.payoff).toBeNull();
  });
  it('a payoff alone is written; an empty name falls back to the item; a long name is cut to 200', () => {
    const w = goAheadInputOfV3(check, ev, 'acc1', ctx(), { payoff: { amount: 100, name: '   ', debtId: 'd', version: 1 } });
    expect(w.payoff).toMatchObject({ name: 'Car' });
    const long = goAheadInputOfV3(check, ev, 'acc1', ctx(), { sale: { amount: 100, name: 'x'.repeat(300) } });
    expect(long.sale?.name).toHaveLength(200);
  });
  it('refuses an amount that is not a positive whole number', () => {
    expect(() => goAheadInputOfV3(check, ev, 'acc1', ctx(), { sale: { amount: 0, name: 'x' } })).toThrow(RangeError);
    expect(() => goAheadInputOfV3(check, ev, 'acc1', ctx(), { payoff: { amount: 1.5, name: 'x', debtId: 'd', version: 1 } })).toThrow(RangeError);
  });
  it('the goal close carries the goal id', () => {
    expect(goAheadInputOfV3(check, ev, 'acc1', ctx(), { goalId: 'g1' }).goalClose).toEqual({ goal_id: 'g1' });
    expect(goAheadInputOfV3(check, ev, 'acc1', ctx(), { goalId: null }).goalClose).toBeNull();
  });
});
