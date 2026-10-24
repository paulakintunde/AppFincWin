/**
 * Named deviation from the prototype (D-22). Reviewers and the Phase 5 team read this file to see why an answer differs from the design mock.
 * Added 2026-10-15 (04-CONTEXT D-44, D-59, D-61; engine depth expansion).
 *
 * New behaviour with no prototype counterpart: the prototype compared cash with the cushion once, at the check date.
 * D-44 walks the next 90 days of cash on the user's own pay dates and dated bills, so a bill that lands before payday
 * shows as its own cause (cash_dip), separate from the cash card. D-59 splits a dip that exists without the purchase
 * (a fact) from the extra depth the purchase adds (the warning). D-61 puts a scheduled outflow on its date.
 */
import { minorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { assess } from '../../assess';
import type { Assessment, DebtRecord, DecideLimits, DecideSnapshot, Verdict } from '../../types';
import { USD, bill, buyCash, income, outflow, snapshotOf } from '../helpers/fixtures';

const m = minorUnits;
const D1: DebtRecord = {
  id: 'd1',
  balance: m(800_000),
  minimumPayment: m(20_000),
  secured: false,
  apr: percent('19.9'),
  currency: USD,
};
const D2: DebtRecord = {
  id: 'd2',
  balance: m(15_000_000),
  minimumPayment: m(90_000),
  secured: true,
  apr: percent('5.1'),
  currency: USD,
};
const LIMITS: DecideLimits = {
  reserve: m(600_000),
  dsrLine: percent('36'),
  housingLine: null,
  unsecuredIncomeMultiple: 12,
  investingFloor: m(40_000),
  savingFloor: m(25_000),
  spareFloor: null,
};
const BL = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  snapshotOf({ debts: [D1, D2], monthlySaving: m(25_000), monthlyInvesting: m(40_000), limits: LIMITS, ...over });
const PAY = income({
  seriesId: 'pay',
  freq: 'monthly',
  anchorDate: '2026-01-25',
  lastPaidDate: '2026-06-25',
  latestAmount: 600_000,
});
const PB = (over: Partial<DecideSnapshot> = {}): DecideSnapshot => BL({ incomeSeries: [PAY], ...over });
const YEARLY_DUE = bill({
  seriesId: 's-ins',
  freq: 'yearly',
  anchorDate: '2025-09-01',
  lastPaidDate: '2025-09-01',
  latestAmount: 120_000,
});
const BILL_BEFORE_PAY = bill({
  seriesId: 's-ins',
  freq: 'yearly',
  anchorDate: '2025-07-24',
  lastPaidDate: '2025-07-24',
  latestAmount: 120_000,
});
const OUT_AHEAD = outflow({ id: 'o_ahead', date: '2026-07-30', amount: 50_000 });
const OUT_PAST = outflow({ id: 'o_past', date: '2026-07-07', amount: 50_000 });

const run = (s: DecideSnapshot, price: number): Assessment => {
  const v: Verdict = assess(s, buyCash(price));
  if (v.state === 'missing') throw new Error('expected a resolved verdict');
  return v;
};
function path(a: Assessment) {
  if (a.cashPath.status !== 'available') throw new Error('expected an available cash path');
  return a.cashPath;
}

describe('D-44 cash path', () => {
  it('D-44: a dated bill that dips cash under the cushion is a cash_dip warning', () => {
    const a = run(PB({ bills: [BILL_BEFORE_PAY] }), 1_300_000);
    expect(a.cashAfter).toBe(700_000);
    expect(a.warnings.some((w) => w.code === 'cash')).toBe(false);
    expect(path(a).lowestWith).toEqual({ day: 14, date: '2026-07-24', amount: 377_808 });
    expect(a.warnings).toContainEqual({ code: 'cash_dip', shortfall: 222_192 });
    expect(a.cashDip).toBe('soft');
    expect(a.state).toBe('adjust');
    // the bill adds exactly its own 120_000 to the shortfall
    const alone = run(PB(), 1_300_000);
    expect(path(alone).lowestWith.amount).toBe(497_808);
    expect(alone.warnings).toContainEqual({ code: 'cash_dip', shortfall: 102_192 });
  });

  it('D-44: below zero is hard and the verdict is no', () => {
    const a = run(PB({ cashOnHand: m(250_000), limits: { ...LIMITS, reserve: m(0) } }), 100_000);
    const p = path(a);
    expect(p.lowestWithout.amount).toBe(47_808);
    expect(p.lowestWith.amount).toBe(-52_192);
    expect(a.cashDip).toBe('hard');
    expect(a.warnings).toEqual([{ code: 'cash_dip', shortfall: 52_192 }]);
    expect(a.state).toBe('no');
  });

  it('D-59: a dip that exists without the purchase is a fact; only the extra depth the purchase adds is a cash_dip', () => {
    // D-59 replaced the replan's default 2, under which this case reported the whole 152_192 gap as the warning.
    const a = run(PB({ cashOnHand: m(150_000), limits: { ...LIMITS, reserve: m(0) } }), 100_000);
    const p = path(a);
    expect(p.lowestWithout.amount).toBe(-52_192);
    expect(p.lowestWith.amount).toBe(-152_192);
    expect(a.warnings).toEqual([{ code: 'cash_dip', shortfall: 100_000 }]);
    expect(a.cashDip).toBe('hard');
    expect(a.state).toBe('no');
    expect(a.facts).toEqual([{ code: 'cash_tight_before_payday', date: '2026-07-24', amount: -52_192 }]);
  });

  it('D-24/D-44 amended: with a cash path, the cash card covers the day-one cost alone', () => {
    const a = run(PB({ bills: [YEARLY_DUE] }), 1_300_000);
    expect(a.cashAfter).toBe(700_000);
    expect(a.warnings.some((w) => w.code === 'cash')).toBe(false);
  });

  it('D-44: without a confirmed pay series the path is skipped and the D-24 deduction stays', () => {
    const a = run(BL({ bills: [YEARLY_DUE] }), 1_300_000);
    expect(a.cashPath).toMatchObject({ status: 'unavailable', code: 'cash_path_unavailable' });
    expect(a.basisCodes).toEqual(['cash_path_unavailable']);
    expect(a.cashAfter).toBe(580_000);
  });

  it('D-61: a scheduled outflow sits on its date in the cash path, not on day 0', () => {
    // Before D-61 a pending outflow would have been taken off cash on day 0 whatever its date.
    const ahead = run(PB({ scheduledOutflows: [OUT_AHEAD] }), 1_300_000);
    expect(ahead.context.cashAvailable).toBe(2_000_000);
    expect(ahead.cashAfter).toBe(700_000);
    expect(ahead.context.cashAfterBills).toBe(1_950_000);
    expect(path(ahead).lowestWith).toEqual({ day: 14, date: '2026-07-24', amount: 497_808 });
    expect(ahead.warnings).toEqual([{ code: 'cash_dip', shortfall: 102_192 }]);
    expect(ahead.warnings).toEqual(run(PB(), 1_300_000).warnings);

    const past = run(PB({ scheduledOutflows: [OUT_PAST] }), 1_300_000);
    expect(past.context.cashAvailable).toBe(1_950_000);
    expect(past.cashAfter).toBe(650_000);
    expect(path(past).lowestWith.amount).toBe(447_808);
    expect(past.warnings).toEqual([{ code: 'cash_dip', shortfall: 152_192 }]);
  });
});
