/** 07-02 (D-12): monthBars reads the recorded months, through this month when asked. */
import { monthBars, pastMonthBars } from '../picture';
import { prepare } from '../../decide/v3/prepare';
import { inputsOf, monthOf, v3Line, v3Series } from '../../decide/v3/__tests__/helpers/fixtures';

function fixture() {
  const month = (m: string, full: boolean) =>
    monthOf(
      m,
      [
        v3Line({ id: `p-${m}`, date: `${m}-05`, amount: 300_000, role: 'income', seriesId: 'pay' }),
        v3Line({ id: `s-${m}`, date: `${m}-07`, amount: 100_000 }),
        v3Line({ id: `d-${m}`, date: `${m}-08`, amount: 20_000, role: 'debt_payment' }),
        v3Line({ id: `r-${m}`, date: `${m}-09`, amount: 5_000, role: 'refund' }),
        v3Line({ id: `t-${m}`, date: `${m}-10`, amount: 50_000, role: 'own_transfer' }),
        v3Line({ id: `ed-${m}`, date: `${m}-10`, amount: 1_000, role: 'envelope_deposit' }),
        v3Line({ id: `ew-${m}`, date: `${m}-10`, amount: 1_000, role: 'envelope_withdrawal' }),
        v3Line({ id: `em-${m}`, date: `${m}-10`, amount: 1_000, role: 'emergency_move' }),
        v3Line({ id: `x-${m}`, date: `${m}-11`, amount: 9_000, status: 'pending' }),
      ],
      { full },
    );
  return prepare(
    inputsOf({
      asOf: '2026-11-15',
      series: [v3Series({ id: 'pay', role: 'pay', cadence: { unit: 'month', every: 1 }, anchorDate: '2026-01-05', amount: 300_000 })],
      months: [month('2026-10', true), month('2026-12', false), month('2026-11', false), month('2026-09', true)],
    }),
  );
}

describe('07-02 monthBars', () => {
  it('throughCurrent false returns the months before this one only', () => {
    expect(monthBars(fixture(), { throughCurrent: false }).map((b) => b.month)).toEqual(['2026-09', '2026-10']);
  });

  it('throughCurrent true adds this month last and never a later month', () => {
    const bars = monthBars(fixture(), { throughCurrent: true });
    expect(bars.map((b) => b.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    const now = bars[2];
    expect(now?.comesIn).toBe(300_000);
    // spending + debt payment less the refund; pending and moves count as neither
    expect(now?.goesOut).toBe(100_000 + 20_000 - 5_000);
    expect(now?.left).toBe(300_000 - 115_000);
  });

  it('pastMonthBars is the same as monthBars without this month', () => {
    const p = fixture();
    expect(pastMonthBars(p)).toEqual(monthBars(p, { throughCurrent: false }));
  });
});
