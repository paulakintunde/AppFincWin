/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 for Phase 5 alignment (04-CONTEXT D-22 extended, D-38).
 *
 * Prototype dBudget: the After column lowered the saving row by investAtRisk but kept the pre-pause Left, so its rows did
 * not add up to the Left it showed. D-38: the table is pre-pause and its rows add up to left in both columns; the pause is
 * reported beside it (inv warning, investingAtRisk, the investments ledger).
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { assess } from '../../assess';
import type { BuyCheck, MonthColumn } from '../../types';
import { USD, monthsOf, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;

const R = snapshotOf({
  months: monthsOf([[1_000_000, 700_000], [1_000_000, 700_000], [1_000_000, 700_000]], '2026-04'),
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
});

const INST: BuyCheck = {
  kind: 'buy',
  currency: USD,
  price: m(1_800_000),
  dayFees: m(0),
  itemType: 'general',
  runningCostsNet: m(0),
  payment: { method: 'instalment', instalmentAmount: m(150_000), instalmentCount: 12 },
};

const adds = (c: MonthColumn): number => c.income - c.living - c.debtPayments - c.savingInvesting - c.thisPurchase;

describe('D-38 month table', () => {
  it('D-38: the month table is pre-pause and its rows add up', () => {
    const v = assess(R, INST);
    if (v.state === 'missing') throw new Error('unexpected missing');
    expect(v.monthTable.after.savingInvesting).toBe(65_000);
    expect(v.monthTable.after.left).toBe(-25_000);
    expect(adds(v.monthTable.now)).toBe(v.monthTable.now.left);
    expect(adds(v.monthTable.after)).toBe(v.monthTable.after.left);
    // The prototype's After rows: saving 65_000 lowered by investAtRisk 25_000 = 40_000, against Left -25_000.
    const protoRowsSum = 1_000_000 - 700_000 - 260_000 - (65_000 - 25_000);
    expect(protoRowsSum).toBe(0);
    expect(protoRowsSum).not.toBe(-25_000);
  });

  it('D-38: the pause is reported beside the table, not inside it', () => {
    const v = assess(R, INST);
    if (v.state === 'missing') throw new Error('unexpected missing');
    expect(v.warnings).toEqual([{ code: 'inv', shortfall: 25_000 }]);
    expect(v.investingAtRisk).toBe(25_000);
    const inv = v.ledgers.find((l) => l.code === 'investments');
    expect(inv?.after).toBe(15_000);
  });
});
