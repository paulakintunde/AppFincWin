/**
 * 05.4 FIN-11 as changed by D-47: the built-up share and the hold-back for yearly and every-3-month bills, the two facts, and
 * how the hold-back reaches spare money. Every branch of heldBack.ts is pinned.
 */
import { minorUnits } from '../../../money/types';
import { evaluate } from '../evaluate';
import { buildFunds } from '../funds/build';
import { heldBackForBills, wholeMonthsBetween } from '../heldBack';
import { buildMonthModel } from '../month/model';
import type { V3Inputs, V3Series } from '../types';
import { checkOnce, inputsOf, monthOf, v3Line, v3Series } from './helpers/fixtures';

const mu = minorUnits;
const yearly = (over: Omit<Partial<V3Series>, 'amount'> & { anchorDate: string; amount?: number }): V3Series =>
  v3Series({ id: 'ins', role: 'bill', cadence: { unit: 'month', every: 12 }, typicalChoice: 'excluded', ...over, amount: over.amount ?? 120_000 });

describe('wholeMonthsBetween', () => {
  it('counts whole months, clamping the day; 0 when the end is not after the start', () => {
    expect(wholeMonthsBetween('2026-03-01', '2026-10-15')).toBe(7);
    expect(wholeMonthsBetween('2026-10-15', '2027-03-01')).toBe(4); // RC-10: paydays 1 Nov, 1 Dec, 1 Jan, 1 Feb
    expect(wholeMonthsBetween('2026-10-15', '2026-10-15')).toBe(0);
    expect(wholeMonthsBetween('2026-10-15', '2026-10-01')).toBe(0);
    expect(wholeMonthsBetween('2026-01-31', '2026-02-28')).toBe(1);
  });
});

describe('heldBackForBills (D-47)', () => {
  it('the built-up share: $1,200 yearly last paid 7 months ago is 70000; $300 quarterly last paid 1 month ago is 10000', () => {
    const y = heldBackForBills([yearly({ anchorDate: '2026-03-01' })], [], '2026-10-01', mu(0));
    expect(y.parts[0]).toEqual({ seriesId: 'ins', amount: 120_000, builtUp: 70_000, holdBack: 70_000, dueDate: '2027-03-01' });
    const q = heldBackForBills([yearly({ id: 'water', anchorDate: '2026-09-01', amount: 30_000, cadence: { unit: 'month', every: 3 } })], [], '2026-10-01', mu(0));
    expect(q.parts[0]).toMatchObject({ builtUp: 10_000, dueDate: '2026-12-01' });
  });

  it('a thin leftover holds back the whole built-up share; an ample one holds back nothing', () => {
    // due in 5 months: min(70000, max(0, 120000 - 5000 x 5)) = 70000
    const thin = heldBackForBills([yearly({ anchorDate: '2026-03-01' })], [], '2026-10-01', mu(5_000));
    expect(thin.total).toBe(70_000);
    expect(thin.parts[0]!.holdBack).toBe(70_000);
    // 120000 - 20000 x 5 = 20000, below the built-up share
    expect(heldBackForBills([yearly({ anchorDate: '2026-03-01' })], [], '2026-10-01', mu(20_000)).total).toBe(20_000);
    const ample = heldBackForBills([yearly({ anchorDate: '2026-03-01' })], [], '2026-10-01', mu(60_000));
    expect(ample.total).toBe(0);
    expect(ample.parts[0]).toMatchObject({ builtUp: 70_000, holdBack: 0, dueDate: '2027-03-01' });
    // a leftover below 0 or unknown counts as 0
    expect(heldBackForBills([yearly({ anchorDate: '2026-03-01' })], [], '2026-10-01', mu(-1)).total).toBe(70_000);
    expect(heldBackForBills([yearly({ anchorDate: '2026-03-01' })], [], '2026-10-01', null).total).toBe(70_000);
  });

  it('resets after each payment: the newest paid line, or the newest due date, whichever is later', () => {
    const s = yearly({ anchorDate: '2025-11-01' });
    // paid early on 14 October for the bill due 1 November: nothing built up the day after, next due 1 November 2027
    const lines = [
      v3Line({ id: 'p1', date: '2026-10-14', amount: 120_000, seriesId: 'ins' }),
      v3Line({ id: 'p0', date: '2025-10-30', amount: 120_000, seriesId: 'ins' }),
      v3Line({ id: 'other', date: '2026-10-14', amount: 120_000, seriesId: 'rent' }),
      v3Line({ id: 'pending', date: '2026-10-14', amount: 120_000, seriesId: 'ins', status: 'pending' }),
      v3Line({ id: 'later', date: '2026-10-20', amount: 120_000, seriesId: 'ins' }),
    ];
    expect(heldBackForBills([s], lines, '2026-10-15', mu(0)).parts[0]).toMatchObject({ builtUp: 0, holdBack: 0, dueDate: '2027-11-01' });
    // a paid line older than the newest due date: the due date counts as the payment
    const old = [v3Line({ id: 'p0', date: '2025-10-30', amount: 120_000, seriesId: 'ins' })];
    expect(heldBackForBills([s], old, '2026-10-15', mu(0)).parts[0]).toMatchObject({ builtUp: 110_000, dueDate: '2026-11-01' });
    // on the day it was paid nothing has built up
    expect(heldBackForBills([s], [v3Line({ id: 'p', date: '2026-10-15', amount: 120_000, seriesId: 'ins' })], '2026-10-15', mu(0)).parts[0]!.builtUp).toBe(0);
  });

  it('with no last-paid date it builds up from the anchor; a first due date still to come has built up nothing', () => {
    expect(heldBackForBills([yearly({ anchorDate: '2026-04-01' })], [], '2026-10-15', mu(0)).parts[0]).toMatchObject({ builtUp: 60_000, dueDate: '2027-04-01' });
    expect(heldBackForBills([yearly({ anchorDate: '2026-12-01' })], [], '2026-10-15', mu(0)).parts[0]).toMatchObject({ builtUp: 0, holdBack: 0, dueDate: '2026-12-01' });
    // a payment made early for a first due date still to come counts for it: built up from the payment, the next one due after
    const early = [v3Line({ id: 'p', date: '2026-09-01', amount: 120_000, seriesId: 'ins' })];
    expect(heldBackForBills([yearly({ anchorDate: '2026-12-01' })], early, '2026-10-15', mu(0)).parts[0]).toMatchObject({ builtUp: 10_000, dueDate: '2027-12-01' });
  });

  it('a bill due this month is already in this month’s bills, so nothing is held back for it; the share never passes the bill', () => {
    const q = yearly({ anchorDate: '2025-11-30', amount: 30_000, cadence: { unit: 'month', every: 3 } });
    // last due 28 Feb (clamped), 29 May: three whole months, the whole bill built up, due 30 May
    expect(heldBackForBills([q], [], '2026-05-29', mu(0)).parts[0]).toEqual({ seriesId: 'ins', amount: 30_000, builtUp: 30_000, holdBack: 0, dueDate: '2026-05-30' });
    expect(heldBackForBills([yearly({ anchorDate: '2025-10-25' })], [], '2026-10-15', mu(0)).parts[0]).toMatchObject({ holdBack: 0, dueDate: '2026-10-25' });
  });

  it('only live yearly and every-3-month bills with an amount count, in id order; an ending bill or one someone else pays is out', () => {
    const series: V3Series[] = [
      yearly({ id: 'c', anchorDate: '2026-03-01' }),
      yearly({ id: 'a', anchorDate: '2026-03-01', amount: 60_000 }),
      yearly({ id: 'b', anchorDate: '2026-09-01', amount: 30_000, cadence: { unit: 'month', every: 3 } }),
      yearly({ id: 'monthly', anchorDate: '2026-03-01', cadence: { unit: 'month', every: 1 } }),
      yearly({ id: 'six', anchorDate: '2026-03-01', cadence: { unit: 'month', every: 6 } }),
      yearly({ id: 'weekly', anchorDate: '2026-03-01', cadence: { unit: 'week', every: 12 } }),
      yearly({ id: 'zero', anchorDate: '2026-03-01', amount: 0 }),
      yearly({ id: 'ending', anchorDate: '2026-03-01', endDate: '2026-12-31' }),
      yearly({ id: 'kept', anchorDate: '2026-03-01', endDate: '2027-03-01' }),
      yearly({ id: 'theirs', anchorDate: '2026-03-01' }),
      v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 12 }, anchorDate: '2026-03-01', amount: 1 }),
    ];
    const r = heldBackForBills(series, [], '2026-10-01', mu(0), new Set(['theirs']));
    expect(r.parts.map((p) => p.seriesId)).toEqual(['a', 'b', 'c', 'kept']);
    expect(r.total).toBe(35_000 + 10_000 + 70_000 + 70_000);
    expect(heldBackForBills(series.slice(0, 1), [], '2026-10-01', mu(0)).parts).toHaveLength(1);
  });
});

/** Six usual months: pay 250000, bills 100000, everyday 80000 (so the usual month leaves 70000), and October so far. */
function hana(over: Partial<V3Inputs> = {}, bills: readonly V3Series[] = []): V3Inputs {
  const pay = v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-01', amount: 250_000 });
  const rent = v3Series({ id: 'rent', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-04-02', amount: 100_000 });
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((m) =>
    monthOf(m, [
      v3Line({ id: `in-${m}`, date: `${m}-01`, amount: 250_000, role: 'income', seriesId: 'pay' }),
      v3Line({ id: `r-${m}`, date: `${m}-02`, amount: 100_000, seriesId: 'rent' }),
      v3Line({ id: `d-${m}`, date: `${m}-15`, amount: 80_000 }),
    ])
  );
  const oct = monthOf(
    '2026-10',
    [
      v3Line({ id: 'in-oct', date: '2026-10-01', amount: 250_000, role: 'income', seriesId: 'pay' }),
      v3Line({ id: 'r-oct', date: '2026-10-02', amount: 100_000, seriesId: 'rent' }),
      v3Line({ id: 'd-oct', date: '2026-10-03', amount: 40_000 }),
    ],
    { full: false }
  );
  return inputsOf({
    asOf: '2026-10-15',
    series: [pay, rent, ...bills],
    months: [...months, oct],
    balance: mu(190_000),
    unspent: { amount: mu(150_000), at: '2026-10-15' },
    safetyNet: { protect: false, size: null, saved: mu(0) },
    ...over,
  });
}

describe('the hold-back in the answer (D-47)', () => {
  const insurance = (anchorDate: string, amount = 120_000): V3Series => yearly({ anchorDate, amount });

  it('RC-10: an ample leftover holds back nothing, and the coming bill is still named', () => {
    const ev = evaluate(hana({}, [insurance('2026-03-01')]), checkOnce(145_000));
    expect(ev.funds.billsHeld).toEqual({ total: 0, parts: [{ seriesId: 'ins', amount: 120_000, builtUp: 70_000, holdBack: 0, dueDate: '2027-03-01' }] });
    expect(ev.funds.unspent?.available).toBe(150_000);
    // nothing held back, and the insurance due in 4 months is still named
    expect(ev.result.facts.filter((f) => f.code === 'yearly_bill_ahead' || f.code === 'bills_held_back')).toEqual([
      { code: 'yearly_bill_ahead', values: { seriesId: 'ins', amount: 120_000, dueDate: '2027-03-01' } },
    ]);
    // due in 1 month: the line names it too
    const soon = evaluate(hana({}, [insurance('2025-12-01')]), checkOnce(10_000));
    expect(soon.result.facts.filter((f) => f.code === 'yearly_bill_ahead')).toEqual([{ code: 'yearly_bill_ahead', values: { seriesId: 'ins', amount: 120_000, dueDate: '2026-12-01' } }]);
    // 10 months built up (100000); 1 whole month before 1 December leaves 120000 - 70000 = 50000 to hold back
    expect(soon.result.facts.find((f) => f.code === 'bills_held_back')?.values).toEqual({ total: 50_000 });
    expect(soon.funds.unspent?.available).toBe(100_000);
    // nothing held back: the line still shows
    const paidUp = evaluate(hana({}, [insurance('2025-12-01', 60_000)]), checkOnce(10_000));
    expect(paidUp.result.facts.filter((f) => f.code === 'bills_held_back')).toEqual([]);
    expect(paidUp.result.facts.some((f) => f.code === 'yearly_bill_ahead')).toBe(true);
  });

  it('a thin leftover holds back the built-up share from spare money, and says so', () => {
    // a 1,000,000 bill: 1,000,000 - 70000 x 4 = 720000 is more than the 7 months built up (583333)
    const inputs = hana({}, [insurance('2026-03-01', 1_000_000)]);
    const month = buildMonthModel(inputs);
    const funds = buildFunds(inputs, month, null);
    expect(funds.billsHeld?.total).toBe(583_333);
    expect(funds.unspent?.available).toBe(150_000 - 583_333);
    const ev = evaluate(inputs, checkOnce(100_000));
    expect(ev.result.code).toBe('not_yet');
    const codes = ev.result.facts.map((f) => f.code);
    expect(codes).toContain('bills_held_back');
    expect(ev.result.facts.find((f) => f.code === 'bills_held_back')?.values).toEqual({ total: 583_333 });
    expect(ev.result.facts.find((f) => f.code === 'yearly_bill_ahead')?.values).toEqual({ seriesId: 'ins', amount: 1_000_000, dueDate: '2027-03-01' });
    // without the bill the same purchase fits from earlier money
    expect(evaluate(hana(), checkOnce(100_000)).result.code).toBe('fits_unspent');
  });

  it('no yearly bill: no hold-back field and spare money unchanged; unknown unspent keeps the field', () => {
    const plain = buildFunds(hana(), buildMonthModel(hana()), null);
    expect(plain.billsHeld).toBeUndefined();
    const none = hana({ unspent: null }, [insurance('2026-03-01', 1_000_000)]);
    const f = buildFunds(none, buildMonthModel(none), null);
    expect(f.unspent).toBeNull();
    expect(f.billsHeld?.total).toBe(583_333);
  });
});
