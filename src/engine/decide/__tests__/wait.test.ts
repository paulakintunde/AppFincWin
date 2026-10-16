import { minorUnits, type MinorUnits } from '../../money/types';
import { percent } from '../../payoff/types';
import { buildAlternatives } from '../alternatives';
import { assessPlan, prepareContext } from '../assess';
import { resolvePlanStrict } from '../plan';
import type { AssessContext, DebtRecord, DecideLimits, DecideSnapshot, InvestCheck, PurchaseCheck } from '../types';
import { buildWaitPlan } from '../wait';
import { USD, bill, buyCash, fullMonth, income, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;

// the 04-07 fixture BL: cash 2_000_000, reserve 600_000, leftBefore 125_000, asOf 2026-07-10 (spare cash 1_400_000)
const D1: DebtRecord = {
  id: 'd1',
  balance: mu(800_000),
  minimumPayment: mu(20_000),
  secured: false,
  apr: percent('19.9'),
  currency: USD,
};
const D2: DebtRecord = { ...D1, id: 'd2', balance: mu(15_000_000), minimumPayment: mu(90_000), secured: true };
const LIMITS_BL: DecideLimits = {
  reserve: mu(600_000),
  dsrLine: percent('36'),
  unsecuredIncomeMultiple: 12,
  investingFloor: mu(40_000),
  savingFloor: mu(25_000),
  spareFloor: null,
};
const BL = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  snapshotOf({
    debts: [D1, D2],
    monthlySaving: mu(25_000),
    monthlyInvesting: mu(40_000),
    limits: LIMITS_BL,
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
const PB = (over: Partial<DecideSnapshot> = {}): DecideSnapshot => BL({ incomeSeries: [PAY], ...over });

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error(`expected ok, got ${r.reasons.join(',')}`);
  return r.context;
}
const waitOf = (s: DecideSnapshot, check: PurchaseCheck, amount: number | null = null) =>
  buildWaitPlan(ctxOf(s), check, amount === null ? null : mu(amount));

describe('buildWaitPlan (D-40)', () => {
  it('default amount is the monthly surplus; target is what spare cash does not cover', () => {
    expect(waitOf(BL(), buyCash(1_700_000))).toEqual({
      target: 300_000,
      monthlyAmount: 125_000,
      spareMonthly: 125_000,
      withinSpare: true,
      months: 3,
      readyBy: '2026-10-10',
    });
  });

  it('months equal the alternatives monthsToBuy for the same check', () => {
    const ctx = ctxOf(BL());
    const check = buyCash(1_700_000);
    const alts = buildAlternatives(ctx, check, assessPlan(ctx, check, resolvePlanStrict(check)));
    expect(buildWaitPlan(ctx, check, null).months).toBe(alts.monthsToBuy);
  });

  it('a user amount: 200_000 is over the surplus, 1_000 takes 300 months', () => {
    const fast = waitOf(BL(), buyCash(1_700_000), 200_000);
    expect(fast).toMatchObject({ months: 2, withinSpare: false, monthlyAmount: 200_000 });
    const slow = waitOf(BL(), buyCash(1_700_000), 1_000);
    expect(slow).toMatchObject({ months: 300, readyBy: '2051-07-10', withinSpare: true });
  });

  it('a loan is bought outright by waiting, so the loan terms do not matter', () => {
    const loan = buyCash(1_450_000, {
      payment: { method: 'loan', deposit: mu(300_000), termMonths: 48, apr: percent('9.4') },
    });
    expect(waitOf(BL(), loan)).toMatchObject({ target: 50_000, months: 1 });
  });

  it('a price spare cash covers needs one month at least', () => {
    expect(waitOf(BL(), buyCash(1_000_000))).toMatchObject({ target: 0, months: 1, readyBy: '2026-08-10' });
  });

  it('subtracts a bill due within 90 days from spare cash (D-24)', () => {
    expect(waitOf(BL({ bills: [YEARLY_DUE] }), buyCash(1_700_000))).toMatchObject({
      target: 420_000,
      months: 4,
      readyBy: '2026-11-10',
    });
  });

  it('still subtracts it with a confirmed pay series (checker resolution 2026-10-15)', () => {
    expect(waitOf(PB({ bills: [YEARLY_DUE] }), buyCash(1_700_000))).toMatchObject({
      target: 420_000,
      months: 4,
      readyBy: '2026-11-10',
    });
  });

  it('clamps the ready-by date to the month end', () => {
    expect(waitOf(BL({ asOf: '2026-01-31' }), buyCash(1_450_000))).toMatchObject({ months: 1, readyBy: '2026-02-28' });
  });

  it('no surplus and no amount: months and date are null, an amount of 0 is within spare', () => {
    const s = BL({ months: [1, 2, 3].map((i) => fullMonth(`2026-0${3 + i}`, 600_000, 445_000)) });
    expect(waitOf(s, buyCash(1_700_000))).toEqual({
      target: 300_000,
      monthlyAmount: 0,
      spareMonthly: 0,
      withinSpare: true,
      months: null,
      readyBy: null,
    });
  });

  it('an explicit amount of 0 behaves the same', () => {
    expect(waitOf(BL(), buyCash(1_700_000), 0)).toMatchObject({ months: null, readyBy: null, withinSpare: true });
  });

  it('uses my part of the price in a household (D-34)', () => {
    const s = BL({
      scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } },
      householdSpending: { rule: { kind: 'even' }, byCategory: [] },
    });
    const ctx = ctxOf(s);
    const w = buildWaitPlan(ctx, buyCash(3_000_000), null);
    expect(w.target).toBe(1_500_000 - (ctx.cashAfterBills - ctx.limits.reserve));
  });

  it('an invest check targets the amount', () => {
    const lump: InvestCheck = { kind: 'invest', currency: USD, amount: mu(50_000), payment: { method: 'lump' } };
    expect(waitOf(BL(), lump).target).toBe(50_000);
  });

  it('months beyond the simulation cap are reported but have no date', () => {
    expect(waitOf(BL(), buyCash(2_100_000), 1_000)).toMatchObject({ target: 700_000, months: 700, readyBy: null });
  });

  it('rejects a negative or fractional amount', () => {
    for (const bad of [-1, 1.5]) {
      expect(() => buildWaitPlan(ctxOf(BL()), buyCash(1_700_000), bad as MinorUnits)).toThrow(/^buildWaitPlan: /);
    }
  });
});
