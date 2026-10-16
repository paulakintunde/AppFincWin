/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-22 extended).
 *
 * The prototype ran the same warning rules for invest checks as for purchases. D-33: an invest check never emits `inv`
 * (pausing old investing to fund new investing is circular) and carries no debt-line warnings; `month` carries the shortfall.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { assess } from '../../assess';
import type { DecideSnapshot, InvestCheck } from '../../types';
import { USD, buyCash, monthsOf, snapshotOf } from '../helpers/fixtures';

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
      unsecuredIncomeMultiple: 12,
      investingFloor: m(40_000),
      savingFloor: m(25_000),
      spareFloor: null,
    },
    ...over,
  });
}

const invest = (amount: number, payment: InvestCheck['payment']): InvestCheck => ({
  kind: 'invest',
  currency: USD,
  amount: m(amount),
  payment,
});

describe('D-33 invest checks', () => {
  it('D-33: an invest check never emits inv', () => {
    // Prototype: `if (investAfter < minInv) w.push({ k: 'inv', ... })` whatever dKind.
    const r = bl({ months: monthsOf([[1_000_000, 700_000], [1_000_000, 700_000], [1_000_000, 700_000]], '2026-04') });
    const v = assess(r, invest(150_000, { method: 'monthly', termMonths: 24 }));
    if (v.state === 'missing') throw new Error('unexpected missing');
    expect(v.state).toBe('no');
    expect(v.warnings).toEqual([{ code: 'month', shortfall: 25_000 }]);
  });

  it('D-33: only month and cash apply to an invest check', () => {
    const base = bl();
    const over = bl({ limits: { ...base.limits, dsrLine: percent('10'), unsecuredIncomeMultiple: 0 } });
    const buy = assess(over, buyCash(50_000));
    if (buy.state === 'missing') throw new Error('unexpected missing');
    expect(buy.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['dsr', 'owe']));
    const v = assess(over, invest(50_000, { method: 'lump' }));
    if (v.state === 'missing') throw new Error('unexpected missing');
    expect(v.warnings).toEqual([]);
    expect(v.state).toBe('fits');
  });
});
