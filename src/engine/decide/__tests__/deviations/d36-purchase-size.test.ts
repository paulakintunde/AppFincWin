/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-22 extended).
 *
 * New behaviour with no prototype counterpart: the prototype had no purchase size code. D-05 forbids dollar thresholds
 * (no "small purchase under $100"), so the size is judged against the user's own money only.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { assess } from '../../assess';
import { firstRead } from '../../firstRead';
import type { BuyCheck, DecideSnapshot, PurchaseSize } from '../../types';
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

function sizeOf(snap: DecideSnapshot, check: BuyCheck): PurchaseSize {
  const v = assess(snap, check);
  if (v.size === null) throw new Error('expected a size');
  return v.size;
}

const YEARLY_DUE = bill({
  seriesId: 's-ins',
  freq: 'yearly',
  anchorDate: '2025-09-01',
  lastPaidDate: '2025-09-01',
  latestAmount: 120_000,
});

describe('D-36 purchase size', () => {
  it("D-36: the purchase size is judged against the user's own money, with no dollar thresholds", () => {
    expect(sizeOf(bl(), buyCash(125_000))).toBe('from_spare_this_month');
    expect(sizeOf(bl(), buyCash(125_001))).toBe('from_savings');
    expect(sizeOf(bl(), buyCash(1_400_000))).toBe('from_savings');
    expect(sizeOf(bl(), buyCash(1_400_001))).toBe('needs_spreading');
  });

  it('D-36: the size ignores the payment method', () => {
    const base = buyCash(1_400_001);
    const loan: BuyCheck = {
      ...base,
      payment: { method: 'loan', deposit: m(300_000), termMonths: 48, apr: percent('9.4') },
    };
    const instalment: BuyCheck = {
      ...base,
      payment: { method: 'instalment', instalmentAmount: m(120_000), instalmentCount: 12 },
    };
    const card: BuyCheck = {
      ...base,
      payment: {
        method: 'card',
        card: {
          id: 'c1',
          apr: percent('22.9'),
          minimumTerms: { minimumPercent: percent('1'), interestAdded: true, floor: m(2_500) },
          currency: USD,
        },
        payoff: { kind: 'full' },
        dealerCap: m(5_000_000),
      },
    };
    for (const c of [loan, instalment, card]) expect(sizeOf(bl(), c)).toBe('needs_spreading');
    const missingTerm: BuyCheck = {
      ...base,
      payment: { method: 'loan', deposit: m(0), termMonths: null, apr: percent('9.4') },
    };
    const v = assess(bl(), missingTerm);
    expect(v.state).toBe('missing');
    expect(v.size).toBe('needs_spreading');
  });

  it('D-36: bills due within 90 days count against the savings band', () => {
    expect(sizeOf(bl({ bills: [YEARLY_DUE] }), buyCash(1_300_000))).toBe('needs_spreading');
    expect(sizeOf(bl(), buyCash(1_300_000))).toBe('from_savings');
  });

  it('D-36: in household scope the size uses my part of the price', () => {
    const hh = (rule: 'even' | 'mine') =>
      snapshotOf({
        scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: rule } },
        householdSpending: { rule: { kind: 'even' }, byCategory: [] },
        debts: bl().debts,
        monthlySaving: m(25_000),
        monthlyInvesting: m(40_000),
      });
    // leftBefore 600_000 - 150_000 - 110_000 - 65_000 = 275_000
    expect(sizeOf(hh('even'), buyCash(550_000))).toBe('from_spare_this_month');
    expect(sizeOf(hh('mine'), buyCash(550_000))).toBe('from_savings');
  });

  it('D-36: a first read sizes the purchase from the rough figures', () => {
    const figures = { currency: USD, cash: m(2_000_000), monthlyIncome: m(420_000), monthlySpending: m(350_000) };
    expect(firstRead(figures, buyCash(70_000)).size).toBe('from_spare_this_month');
    expect(firstRead(figures, buyCash(950_000)).size).toBe('from_savings');
    expect(firstRead(figures, buyCash(950_001)).size).toBe('needs_spreading');
  });
});
