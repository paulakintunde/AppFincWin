/**
 * 06-19 Task 1: the record calculators reproduce the prototype ledger (design/LEDGER.md, GC02, GC04, GC05) to the cent.
 */
import { debtExtraModel, goalCalcModel, growthIllustrationModel, type DebtExtraContext, type GoalCalcContext } from '../record/recordCalcModels';

// Trip to Lisbon: 116000 left, deposits on the 16th from 2026-11-16. These are the models' own units (the ledger table is
// scaled by the intoGoals / left figures below).
const lisbon: GoalCalcContext = {
  saved: 64000,
  target: 180000,
  anchor: '2026-11-16',
  currentMonthly: 5000,
  intoGoals: 15000,
  leftInUsualMonth: 42500,
  savingLine: 15000,
};

describe('goalCalcModel (GC02)', () => {
  it('$25 a month: 47 deposits, Sep 2030, below the saving line', () => {
    const r = goalCalcModel(lisbon, { monthly: 2500 })!;
    expect(r.deposits).toBe(47);
    expect(r.reachesOn.slice(0, 7)).toBe('2030-09');
    expect(r.intoGoals).toBe(12500);
    expect(r.left).toBe(45000);
    expect(r.belowSavingLine).toBe(true);
    expect(r.isCurrentPlan).toBe(false);
  });

  it('reproduces every ledger row', () => {
    const rows: [number, number, string][] = [
      [5000, 24, '2028-10'],
      [7500, 16, '2028-02'],
      [10000, 12, '2027-10'],
      [8286, 14, '2027-12'],
      [5800, 20, '2028-06'],
    ];
    for (const [monthly, deposits, month] of rows) {
      const r = goalCalcModel(lisbon, { monthly })!;
      expect(r.deposits).toBe(deposits);
      expect(r.reachesOn.slice(0, 7)).toBe(month);
    }
  });

  it('by Dec 2027 needs $82.86 a month, rounded up, and moves the month figures', () => {
    const r = goalCalcModel(lisbon, { byDate: '2027-12' })!;
    expect(r.monthly).toBe(8286);
    expect(r.deposits).toBe(14);
    expect(r.intoGoals).toBe(18286);
    expect(r.left).toBe(39214);
    expect(r.belowSavingLine).toBe(false);
  });

  it('by Oct 2028 needs $48.34 a month', () => {
    expect(goalCalcModel(lisbon, { byDate: '2028-10' })!.monthly).toBe(4834);
  });

  it('marks the current plan when the monthly equals what is set now', () => {
    expect(goalCalcModel(lisbon, { monthly: 5000 })!.isCurrentPlan).toBe(true);
  });

  it('is null for nothing to compute', () => {
    expect(goalCalcModel(lisbon, { monthly: 0 })).toBeNull();
    expect(goalCalcModel(lisbon, { byDate: '2026-10' })).toBeNull();
    expect(goalCalcModel({ ...lisbon, saved: 180000 }, { monthly: 5000 })).toBeNull();
    expect(goalCalcModel({ ...lisbon, target: null }, { monthly: 5000 })).toBeNull();
  });

  it('has no saving-line verdict without a line, and no left figure without a month', () => {
    const r = goalCalcModel({ ...lisbon, savingLine: null, leftInUsualMonth: null }, { monthly: 2500 })!;
    expect(r.belowSavingLine).toBe(false);
    expect(r.left).toBeNull();
  });
});

const autoLoan: DebtExtraContext = { balance: 842000, apr: '6.9', payment: 31200, firstDate: '2026-11-15', usualPay: 320000 };

describe('debtExtraModel (GC04)', () => {
  it('none: 30 payments, Apr 2029, 75636 interest, last 12836, 10% of pay', () => {
    const r = debtExtraModel(autoLoan, 0)!;
    expect(r.months).toBe(30);
    expect(r.endDate.slice(0, 7)).toBe('2029-04');
    expect(r.interest).toBe(75636);
    expect(r.interestSaved).toBe(0);
    expect(r.lastPayment).toBe(12836);
    expect(r.sharePercent).toBe(10);
    expect(r.soonerMonths).toBe(0);
  });

  it('+$25: 28 payments, Feb 2029, saved 6037', () => {
    const r = debtExtraModel(autoLoan, 2500)!;
    expect([r.months, r.endDate.slice(0, 7), r.interest, r.interestSaved, r.sharePercent]).toEqual([28, '2029-02', 69599, 6037, 11]);
  });

  it('+$50: 26 payments of $362, Dec 2028, saved 11145, last 1491, 4 months sooner', () => {
    const r = debtExtraModel(autoLoan, 5000)!;
    expect([r.months, r.endDate.slice(0, 7), r.interest, r.interestSaved, r.lastPayment, r.eachMonth, r.soonerMonths]).toEqual([
      26,
      '2028-12',
      64491,
      11145,
      1491,
      36200,
      4,
    ]);
    expect(r.sharePercent).toBe(11);
  });

  it('+$100: 22 payments, Aug 2028, saved 19318, 13% of pay', () => {
    const r = debtExtraModel(autoLoan, 10000)!;
    expect([r.months, r.endDate.slice(0, 7), r.interestSaved, r.sharePercent]).toEqual([22, '2028-08', 19318, 13]);
  });

  it('paid off in one payment when the extra clears it at once', () => {
    const r = debtExtraModel(autoLoan, 900000)!;
    expect(r.months).toBe(1);
    expect(r.paidInOnePayment).toBe(true);
  });

  it('has no share without usual pay, and is null when the loan never clears', () => {
    expect(debtExtraModel({ ...autoLoan, usualPay: null }, 0)!.sharePercent).toBeNull();
    expect(debtExtraModel({ ...autoLoan, payment: 100 }, 0)).toBeNull();
    // P3-WR-14: an extra that clears it still has an answer; only the comparison with the payment alone is missing.
    const r = debtExtraModel({ ...autoLoan, payment: 4000 }, 2500)!;
    expect(r).not.toBeNull();
    expect(r.eachMonth).toBe(6500);
    expect([r.interestSaved, r.soonerMonths]).toEqual([null, null]);
    expect(debtExtraModel({ ...autoLoan, payment: 4000 }, 0)).toBeNull();
  });
});

describe('growthIllustrationModel (GC05)', () => {
  const base = { start: 769000, monthly: 20000, years: 10 };

  it('4%: 4091444, put in 3169000, growth 922444, $200 alone 2944998', () => {
    const r = growthIllustrationModel({ ...base, rate: '4' })!;
    expect([r.value, r.putIn, r.growth, r.alone]).toEqual([4091444, 3169000, 922444, 2944998]);
    expect(r.years).toHaveLength(10);
  });

  it('2% and 6% reproduce the ledger', () => {
    const two = growthIllustrationModel({ ...base, rate: '2' })!;
    const six = growthIllustrationModel({ ...base, rate: '6' })!;
    expect([two.value, two.alone]).toEqual([3593502, 2654396]);
    expect([six.value, six.alone]).toEqual([4676698, 3277589]);
  });

  it('is null for a bad rate or years', () => {
    expect(growthIllustrationModel({ ...base, rate: '' })).toBeNull();
    expect(growthIllustrationModel({ ...base, rate: '4', years: 0 })).toBeNull();
    expect(growthIllustrationModel({ ...base, rate: '4', years: 51 })).toBeNull();
  });
});
