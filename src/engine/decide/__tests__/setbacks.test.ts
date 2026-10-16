import { minorUnits } from '../../money/types';
import { percent } from '../../payoff/types';
import { assessPlan, prepareContext } from '../assess';
import { DEFAULT_SETBACKS } from '../constants';
import { resolvePlanStrict } from '../plan';
import { applySetbacks, runwayMonthsOf, setbackHit, setbackHitFor } from '../setbacks';
import type { Assessment, DecideSnapshot, PurchaseCheck, SetbackBasis, SetbackInput } from '../types';
import { bill, buyCash, income, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;

const D1 = {
  id: 'd1',
  balance: mu(800_000),
  minimumPayment: mu(20_000),
  secured: false,
  apr: percent('19.9'),
  currency: snapshotOf().currency,
};
const D2 = { ...D1, id: 'd2', balance: mu(15_000_000), minimumPayment: mu(90_000), secured: true, apr: percent('5.1') };
const BL = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  snapshotOf({
    debts: [D1, D2],
    monthlySaving: mu(25_000),
    monthlyInvesting: mu(40_000),
    ...over,
  });
const YEARLY_DUE = bill({
  seriesId: 's-ins',
  freq: 'yearly',
  anchorDate: '2025-09-01',
  lastPaidDate: '2025-09-01',
  latestAmount: 120_000,
});
const PAY = income({
  seriesId: 'pay',
  freq: 'monthly',
  anchorDate: '2026-01-25',
  lastPaidDate: '2026-06-25',
  latestAmount: 600_000,
});

function assessOf(s: DecideSnapshot, check: PurchaseCheck): Assessment {
  const r = prepareContext(s);
  if (!r.ok) throw new Error('expected ok');
  return assessPlan(r.context, check, resolvePlanStrict(check));
}

/**
 * The plan's fixture: incomeBasis 600_000, cash after the purchase 1_700_000, reserve 1_230_000 (three months of
 * 410_000), monthCosts 410_000, burn 560_000 (a 150_000 monthly payment on top of 410_000).
 */
const base = assessOf(BL(), buyCash(300_000));
const A: Assessment = { ...base, burn: mu(560_000) };
const HITS = { incomeBasis: mu(600_000), burn: mu(560_000), monthCosts: mu(410_000) };

const enable = (code: SetbackInput['code'], over: Record<string, unknown> = {}): SetbackInput[] =>
  DEFAULT_SETBACKS.map((s) => (s.code === code ? ({ ...s, enabled: true, ...over } as SetbackInput) : s));

describe('fixture sanity', () => {
  it('matches the plan figures', () => {
    expect(A.context.money.incomeBasis).toBe(600_000);
    expect(A.context.limits.reserve).toBe(1_230_000);
    expect(A.context.monthCosts).toBe(410_000);
    expect(A.cashAfterBillsAndPurchase).toBe(1_700_000);
    expect(A.cashAfter).toBe(1_700_000);
  });
});

describe('setbackHit (DEC-15)', () => {
  const hit = (s: SetbackInput) => setbackHit(s, A);

  it('unexpected expense: the amount, or one month of costs when null (D-05)', () => {
    expect(hit({ code: 'unexpected_expense', enabled: true, amount: mu(120_000) })).toBe(120_000);
    expect(hit({ code: 'unexpected_expense', enabled: true, amount: null })).toBe(410_000);
  });

  it('income drop: income basis x percent x months, a zero months counts as one', () => {
    expect(hit({ code: 'income_drop', enabled: true, percentDrop: 20, months: 2 })).toBe(240_000);
    expect(hit({ code: 'income_drop', enabled: true, percentDrop: 20, months: 0 })).toBe(120_000);
  });

  it('late invoice: income basis x days / 30, half-up', () => {
    expect(hit({ code: 'late_invoice', enabled: true, daysLate: 30 })).toBe(600_000);
    expect(hit({ code: 'late_invoice', enabled: true, daysLate: 45 })).toBe(900_000);
    expect(hit({ code: 'late_invoice', enabled: true, daysLate: 0 })).toBe(0);
  });

  it('job loss: months x burn, a zero months counts as one, negative burn gives 0', () => {
    expect(hit({ code: 'job_loss', enabled: true, months: 8 })).toBe(4_480_000);
    expect(hit({ code: 'job_loss', enabled: true, months: 0 })).toBe(560_000);
    expect(setbackHitFor({ code: 'job_loss', enabled: true, months: 8 }, { ...HITS, burn: mu(-5) })).toBe(0);
  });

  it('rejects out-of-range parameters', () => {
    const bad: SetbackInput[] = [
      { code: 'income_drop', enabled: true, percentDrop: 101, months: 1 },
      { code: 'income_drop', enabled: true, percentDrop: -1, months: 1 },
      { code: 'income_drop', enabled: true, percentDrop: 1.5, months: 1 },
      { code: 'income_drop', enabled: true, percentDrop: 20, months: -1 },
      { code: 'income_drop', enabled: true, percentDrop: 20, months: 1.5 },
      { code: 'job_loss', enabled: true, months: -1 },
      { code: 'job_loss', enabled: true, months: 1.5 },
      { code: 'late_invoice', enabled: true, daysLate: -1 },
      { code: 'late_invoice', enabled: true, daysLate: 1.5 },
      { code: 'unexpected_expense', enabled: true, amount: mu(-1) },
    ];
    for (const s of bad) expect(() => hit(s)).toThrow(/^setbackHit: /);
  });

  it('throws on an unknown code', () => {
    expect(() => hit({ code: 'meteor', enabled: true } as unknown as SetbackInput)).toThrow('Unhandled setback');
  });
});

describe('setbackHitFor / runwayMonthsOf (D-54 shape, D-39)', () => {
  it('setbackHitFor on the fixture basis equals setbackHit on the assessment', () => {
    for (const s of DEFAULT_SETBACKS) expect(setbackHitFor(s, HITS)).toBe(setbackHit(s, A));
  });

  it('a basis without the purchase gives a smaller job-loss hit', () => {
    const noPurchase: SetbackBasis = { ...HITS, burn: mu(410_000) };
    expect(setbackHitFor({ code: 'job_loss', enabled: true, months: 8 }, noPurchase)).toBe(3_280_000);
  });

  it('runway is whole months, floored, null with no burn', () => {
    expect(runwayMonthsOf(mu(1_700_000), mu(560_000))).toBe(3);
    expect(runwayMonthsOf(mu(2_000_000), mu(410_000))).toBe(4);
    expect(runwayMonthsOf(mu(-10_000), mu(560_000))).toBe(0);
    expect(runwayMonthsOf(mu(1_000), mu(0))).toBeNull();
    expect(runwayMonthsOf(mu(1_000), mu(-5))).toBeNull();
  });
});

describe('applySetbacks (DEC-15, D-19)', () => {
  it('four results in default order with nothing enabled', () => {
    const r = applySetbacks(A, DEFAULT_SETBACKS);
    expect(r.results.map((x) => x.code)).toEqual(['unexpected_expense', 'income_drop', 'job_loss', 'late_invoice']);
    expect(r.anyEnabled).toBe(false);
    expect(r.combinedHit).toBe(0);
    expect(r.stressedCash).toBe(A.cashAfterBillsAndPurchase);
    expect(r.stressedOutcome).toBe('through_cushion'); // 1_700_000 is not below the 1_230_000 cushion
  });

  it('classifies each result: absorbed, through the cushion, wiped out', () => {
    const r = applySetbacks(A, DEFAULT_SETBACKS);
    const byCode = Object.fromEntries(r.results.map((x) => [x.code, x]));
    expect(byCode.unexpected_expense).toMatchObject({ hit: 410_000, cashAfter: 1_290_000, outcome: 'absorbed' });
    expect(byCode.income_drop).toMatchObject({ hit: 240_000, cashAfter: 1_460_000, outcome: 'absorbed' });
    expect(byCode.late_invoice).toMatchObject({ hit: 600_000, cashAfter: 1_100_000, outcome: 'through_cushion' });
    expect(byCode.job_loss).toMatchObject({ hit: 4_480_000, cashAfter: -2_780_000, outcome: 'wiped_out' });
  });

  it('combines the enabled setbacks', () => {
    const set = DEFAULT_SETBACKS.map((s) =>
      s.code === 'income_drop' || s.code === 'unexpected_expense' ? { ...s, enabled: true } : s
    );
    const r = applySetbacks(A, set);
    expect(r.anyEnabled).toBe(true);
    expect(r.combinedHit).toBe(650_000);
    expect(r.stressedCash).toBe(1_050_000);
    expect(r.stressedOutcome).toBe('through_cushion');
  });

  it('job loss alone is wiped out', () => {
    const r = applySetbacks(A, enable('job_loss'));
    expect(r.stressedCash).toBeLessThan(0);
    expect(r.stressedOutcome).toBe('wiped_out');
  });

  it('an enabled setback with a lighter hit can be absorbed in the stressed figure', () => {
    const r = applySetbacks({ ...A, cashAfterBillsAndPurchase: mu(5_000_000) }, enable('income_drop'));
    expect(r.stressedOutcome).toBe('absorbed');
  });

  it('runway: whole months from the cash after the purchase, independent of the enabled setbacks', () => {
    expect(applySetbacks(A, DEFAULT_SETBACKS).runwayMonths).toBe(3);
    expect(applySetbacks(A, enable('job_loss')).runwayMonths).toBe(3);
    expect(applySetbacks({ ...A, burn: mu(0) }, DEFAULT_SETBACKS).runwayMonths).toBeNull();
    expect(applySetbacks({ ...A, burn: mu(-1) }, DEFAULT_SETBACKS).runwayMonths).toBeNull();
    expect(applySetbacks({ ...A, cashAfterBillsAndPurchase: mu(-10_000) }, DEFAULT_SETBACKS).runwayMonths).toBe(0);
  });
});

describe('setbacks keep the bill deduction (D-24)', () => {
  it('a bill due within 90 days is already out of the starting cash and is not deducted twice', () => {
    const withBill = assessOf(BL({ bills: [YEARLY_DUE] }), buyCash(300_000));
    expect(withBill.cashAfterBillsAndPurchase).toBe(1_580_000);
    const r = applySetbacks(withBill, enable('unexpected_expense', { amount: mu(100_000) }));
    expect(r.results[0]!.cashAfter).toBe(1_580_000 - 100_000);
  });

  it('with a pay series the `cash` ledger skips the bill but setbacks and runway still deduct it', () => {
    const s = BL({ incomeSeries: [PAY], bills: [YEARLY_DUE] });
    const a = assessOf(s, buyCash(300_000));
    expect(a.cashAfter).toBe(1_700_000);
    expect(a.cashAfterBillsAndPurchase).toBe(1_580_000);
    const r = applySetbacks(a, DEFAULT_SETBACKS);
    for (const x of r.results) expect(x.cashAfter).toBe(1_580_000 - x.hit);
    expect(r.stressedCash).toBe(1_580_000);
    expect(a.burn).toBe(420_000);
    expect(r.runwayMonths).toBe(Math.floor(1_580_000 / 420_000));
    expect(r.runwayMonths).toBe(3);
  });
});
