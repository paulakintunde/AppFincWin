// 06-30 (D-33, T-06-30-03): a one-off Expected debt payment (record_debt_one_off) reaches Decide's month once, as money
// going out, and the debt's minimum is still counted once through the debt connection point (no double count, no drop).
// 06-37 (D-35): the line is a debt payment, not spending: money out once, never in a category's spending total.
import { everydayByMonth, type V3Inputs, type V3Line } from '@/engine/decide/v3';
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import type { SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import { SETTINGS, TODAY, USES } from './growScenarios';

type Row = SnapshotSource['rows'][number];

const MONTH = TODAY.slice(0, 7);
const ONE_OFF = 100000; // 1,000.00 in minor units

function oneOffRow(debtId: string, over: Partial<Row> = {}): Row {
  // What record_debt_one_off writes: one pending outgoing line, no series, no transfer, linked to the debt.
  const r = {
    id: 'one-off-1', account_id: 'demo-acct-everyday', local_date: TODAY, original_amount: -ONE_OFF, original_currency: 'USD',
    home_currency: 'USD', home_amount: -ONE_OFF, orig_per_eur: null, status: 'pending' as const, is_refund: false, transfer_id: null,
    recurring_series_id: null, category_id: null, deleted_at: null, debt_id: debtId, ...over,
  };
  return r;
}

const monthLines = (i: V3Inputs): V3Line[] => i.months.filter((m) => m.month === MONTH).flatMap((m) => m.lines);

describe('06-30 a one-off debt payment counts once (D-33)', () => {
  const base = demoSource(TODAY);
  const debt = base.debts.find((d) => d.minimum_payment > 0)!;
  const without = buildV3Inputs(base, SETTINGS, undefined, USES);
  const withOneOff = buildV3Inputs({ ...base, rows: [...base.rows, oneOffRow(debt.id)] }, SETTINGS, undefined, USES);

  it('the line reaches the current month once, as one outflow of its amount', () => {
    const hits = monthLines(withOneOff).filter((l) => l.id === 'one-off-1');
    expect(hits).toHaveLength(1);
    expect(Math.abs(hits[0]!.amount)).toBe(ONE_OFF);
    expect(hits[0]!.status).toBe('pending');
    expect(hits[0]!.role).toBe('debt_payment'); // D-35: a debt payment, the same as a transfer into a loan or card
    // Nothing else in the month moved: the only new line is the one-off.
    expect(monthLines(withOneOff)).toHaveLength(monthLines(without).length + 1);
  });

  it('the debt minimum is still counted once through the debt connection point', () => {
    expect(debt.minimum_payment).toBeGreaterThan(0);
    const before = without.debts.filter((d) => d.id === debt.id);
    const after = withOneOff.debts.filter((d) => d.id === debt.id);
    expect(after).toHaveLength(1);
    expect(after).toEqual(before);
    expect(withOneOff.series).toEqual(without.series);
  });
});

describe('06-37 a one-off debt payment is a debt payment in Decide (D-35)', () => {
  const base = demoSource(TODAY);
  const debt = base.debts.find((d) => d.minimum_payment > 0)!;
  // Paid and carrying a category, the worst case for a category limit: it must still stay out of every category.
  const category = base.rows.find((r) => r.category_id !== null && r.original_amount < 0)!.category_id!;
  const paid = oneOffRow(debt.id, { status: 'paid', category_id: category });
  const without = buildV3Inputs(base, SETTINGS, undefined, USES);
  const withPaid = buildV3Inputs({ ...base, rows: [...base.rows, paid] }, SETTINGS, undefined, USES);
  const everyday = (i: V3Inputs) => everydayByMonth(i.months, i.series).find((m) => m.month === MONTH)!;

  it('the paid line reaches the month once, as a debt payment of its amount', () => {
    const hits = monthLines(withPaid).filter((l) => l.id === 'one-off-1');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.role).toBe('debt_payment');
    expect(hits[0]!.status).toBe('paid');
    expect(Math.abs(hits[0]!.amount)).toBe(ONE_OFF);
    expect(monthLines(withPaid)).toHaveLength(monthLines(without).length + 1);
  });

  it("is in no category's spending total and not in everyday spending", () => {
    const before = everyday(without);
    const after = everyday(withPaid);
    expect(after.everyday).toBe(before.everyday);
    expect([...after.byCategory.entries()]).toEqual([...before.byCategory.entries()]);
    expect(after.byCategory.get(category) ?? 0n).toBe(before.byCategory.get(category) ?? 0n);
  });

  it('an incoming line tagged to a debt is not read as a payment', () => {
    const back = oneOffRow(debt.id, { id: 'one-off-in', original_amount: ONE_OFF, home_amount: ONE_OFF, status: 'paid' });
    const built = buildV3Inputs({ ...base, rows: [...base.rows, back] }, SETTINGS, undefined, USES);
    const hit = monthLines(built).find((l) => l.id === 'one-off-in');
    expect(hit?.role).not.toBe('debt_payment');
    // P5-WR-05: money in tagged to a debt is an asset sale: one-time money in, never pay.
    expect(hit?.role).toBe('other_in');
  });

  it('P5-WR-05: a sale (money in) and its final payment (money out), both tagged to the debt, are not pay or spending', () => {
    const sale = oneOffRow(debt.id, { id: 'sale-in', original_amount: 1400000, home_amount: 1400000, status: 'paid' });
    const payoff = oneOffRow(debt.id, { id: 'sale-payoff', original_amount: -900000, home_amount: -900000, status: 'paid' });
    const built = buildV3Inputs({ ...base, rows: [...base.rows, sale, payoff] }, SETTINGS, undefined, USES);
    const lines = monthLines(built);
    expect(lines.find((l) => l.id === 'sale-in')?.role).toBe('other_in');
    expect(lines.find((l) => l.id === 'sale-payoff')?.role).toBe('debt_payment');
    expect(lines.filter((l) => l.role === 'income')).toEqual(monthLines(without).filter((l) => l.role === 'income'));
    expect(everyday(built).everyday).toBe(everyday(without).everyday);
  });
});
