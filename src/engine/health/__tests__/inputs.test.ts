/** 07-01 (ARC-21, D-02, D-25): healthInputsOf is the one reader of Decide's reading. */
import { minorUnits as mu } from '../../money/types';
import { prepare, type Prepared } from '../../decide/v3/prepare';
import type { V3Account, V3Inputs } from '../../decide/v3/types';
import { inputsOf, monthOf, v3Line, v3Series } from '../../decide/v3/__tests__/helpers/fixtures';
import { homeReading, monthPicture } from '../../month/picture';
import { healthInputsOf } from '../inputs';
import { healthScore } from '../score';

const MONTHLY = { unit: 'month', every: 1 } as const;
const everyday = (id: string, balance: number): V3Account => ({ id, balance: mu(balance), use: { kind: 'everyday' }, kind: 'current' });

function sam(over: Partial<V3Inputs> = {}): V3Inputs {
  const months = ['2026-07', '2026-08', '2026-09'].map((m) =>
    monthOf(m, [
      v3Line({ id: `p-${m}`, date: `${m}-25`, amount: 300_000, role: 'income', seriesId: 'pay' }),
      v3Line({ id: `r-${m}`, date: `${m}-10`, amount: 120_000, role: 'spending', seriesId: 'rent' }),
      v3Line({ id: `e-${m}`, date: `${m}-12`, amount: 100_000 }),
    ])
  );
  return inputsOf({
    months: [...months, monthOf('2026-10', [], { full: false })],
    series: [
      v3Series({ id: 'pay', role: 'pay', cadence: MONTHLY, anchorDate: '2026-01-25', amount: 300_000 }),
      v3Series({ id: 'rent', role: 'bill', cadence: MONTHLY, anchorDate: '2026-01-10', amount: 120_000 }),
    ],
    debts: [{ id: 'loan', kind: 'loan', balance: mu(500_000), minimum: mu(10_000), apr: null, secured: false, isHousing: false, dueDay: 15 }],
    accounts: [everyday('main', 400_000)],
    balance: mu(400_000),
    ...over,
  });
}

describe('healthInputsOf', () => {
  it('maps every figure from the home reading', () => {
    const p = prepare(sam());
    const r = homeReading(p);
    const h = healthInputsOf(p);
    expect(h.moneyIn).toBe(r.month.moneyIn);
    expect(h.left).toBe(monthPicture(p).leftAfterPlans);
    expect(h.emergency).toBe(r.funds.emergency);
    expect(h.monthlyEssential).toBe(r.net.starter);
    expect(h.typicalIncome).toBe(r.month.typicalIncome);
    expect(h.billsDue).toBe(r.month.billsDue);
    expect(h.moneyOut).toBe(r.month.moneyOut);
    expect(h.debtTotal).toBe(500_000);
    expect(h.hasBalance).toBe(true);
    expect(h.short).toBe(false);
  });

  it('counts only debts with a balance above zero', () => {
    const loan = { id: 'l', kind: 'loan', minimum: mu(0), apr: null, secured: false, isHousing: false } as const;
    const p = prepare(sam({ debts: [{ ...loan, balance: mu(700_000) }, { ...loan, id: 'm', balance: mu(-5_000) }] }));
    expect(healthInputsOf(p).debtTotal).toBe(700_000);
  });

  it('hasBalance is false with no accounts or an undefined list', () => {
    expect(healthInputsOf(prepare(sam({ accounts: [] }))).hasBalance).toBe(false);
    expect(healthInputsOf(prepare(sam({ accounts: undefined }))).hasBalance).toBe(false);
  });

  it('short when what is left is below zero', () => {
    const p = prepare(sam({ accounts: [everyday('main', -900_000)], balance: mu(-900_000) }));
    expect(monthPicture(p).leftAfterPlans).toBeLessThan(0);
    expect(healthInputsOf(p).short).toBe(true);
  });

  it.each(['typical_short', 'month_heading_short'] as const)('short when the month carries the %s notice', (code) => {
    const p = prepare(sam());
    const r = p.readings[0];
    expect(monthPicture(p).leftAfterPlans).toBeGreaterThanOrEqual(0);
    const withNotice: Pick<Prepared, 'inputs' | 'readings'> = {
      inputs: p.inputs,
      readings: [{ ...r, month: { ...r.month, notices: [...r.month.notices, { code, values: {} }] } }, ...p.readings.slice(1)],
    };
    expect(healthInputsOf(withNotice).short).toBe(true);
  });

  it('feeds the scorer', () => {
    expect(healthScore(healthInputsOf(prepare(sam()))).kind).toBe('score');
  });
});
