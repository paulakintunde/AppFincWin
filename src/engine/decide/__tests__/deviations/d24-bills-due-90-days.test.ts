/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-22 extended).
 *
 * The prototype's cash check read cash on hand alone (`cashAfter = cash - day`); a yearly insurance bill due next month
 * was invisible. D-24: confirmed quarterly/yearly bills due within 90 days come off cash before the cushion test.
 * These tests run without a pay series, so the deduction applies (D-44 amends it only when a cash path exists).
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { assess, prepareContext } from '../../assess';
import type { DecideSnapshot } from '../../types';
import { USD, bill, buyCash, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

function bl(over: Partial<DecideSnapshot> = {}): DecideSnapshot {
  return snapshotOf({
    debts: [
      { id: 'd1', balance: m(800_000), minimumPayment: m(20_000), secured: false, apr: percent('19.9'), currency: USD },
      { id: 'd2', balance: m(15_000_000), minimumPayment: m(90_000), secured: true, apr: percent('5.1'), currency: USD },
    ],
    monthlySaving: m(25_000),
    monthlyInvesting: m(40_000),
    limits: {
      reserve: m(600_000),
      dsrLine: percent('36'),
      housingLine: null,
      unsecuredIncomeMultiple: 12,
      investingFloor: m(40_000),
      savingFloor: m(25_000),
      spareFloor: null,
    },
    ...over,
  });
}

const YEARLY_DUE = bill({
  seriesId: 's-ins',
  freq: 'yearly',
  anchorDate: '2025-09-01',
  lastPaidDate: '2025-09-01',
  latestAmount: 120_000,
});

describe('D-24 bills due within 90 days', () => {
  it('D-24: a yearly bill due within 90 days is deducted from cash before the cushion test', () => {
    const withBill = assess(bl({ bills: [YEARLY_DUE] }), buyCash(1_300_000));
    if (withBill.state === 'missing') throw new Error('unexpected missing');
    expect(withBill.cashAfter).toBe(580_000);
    expect(withBill.state).toBe('adjust');
    expect(withBill.warnings).toEqual([{ code: 'cash', shortfall: 20_000 }]);
    const without = assess(bl(), buyCash(1_300_000));
    if (without.state === 'missing') throw new Error('unexpected missing');
    expect(without.cashAfter).toBe(700_000);
    expect(without.state).toBe('fits');
  });

  it('D-24: a bill already paid this cycle is not deducted', () => {
    const paid = bill({
      seriesId: 's-ins',
      freq: 'yearly',
      anchorDate: '2025-07-05',
      lastPaidDate: '2026-07-05',
      latestAmount: 120_000,
    });
    const r = prepareContext(bl({ bills: [paid] }));
    if (!r.ok) throw new Error('expected ok');
    expect(r.context.billsDue).toBe(0);
  });

  it('D-24: monthly-or-more-frequent series are never deducted', () => {
    const monthly = bill({ seriesId: 's-m', freq: 'monthly', anchorDate: '2026-07-11', latestAmount: 50_000 });
    const weekly = bill({ seriesId: 's-w', freq: 'weekly', anchorDate: '2026-07-12', latestAmount: 10_000 });
    const r = prepareContext(bl({ bills: [monthly, weekly] }));
    if (!r.ok) throw new Error('expected ok');
    expect(r.context.billsDue).toBe(0);
  });
});
