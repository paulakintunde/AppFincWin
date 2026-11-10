// 06-30 (D-33, T-06-30-03): a one-off Expected debt payment (record_debt_one_off) reaches Decide's month once, as money
// going out, and the debt's minimum is still counted once through the debt connection point (no double count, no drop).
import type { V3Inputs, V3Line } from '@/engine/decide/v3';
import { demoSource } from '../../../__tests__/helpers/demoScenario';
import type { SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import { SETTINGS, TODAY, USES } from './growScenarios';

type Row = SnapshotSource['rows'][number];

const MONTH = TODAY.slice(0, 7);
const ONE_OFF = 100000; // 1,000.00 in minor units

function oneOffRow(debtId: string): Row {
  // What record_debt_one_off writes: one pending outgoing line, no series, no transfer, linked to the debt.
  const r = {
    id: 'one-off-1', account_id: 'demo-acct-everyday', local_date: TODAY, original_amount: -ONE_OFF, original_currency: 'USD',
    home_currency: 'USD', home_amount: -ONE_OFF, orig_per_eur: null, status: 'pending' as const, is_refund: false, transfer_id: null,
    recurring_series_id: null, category_id: null, deleted_at: null, debt_id: debtId,
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
    expect(hits[0]!.role).toBe('spending');
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
