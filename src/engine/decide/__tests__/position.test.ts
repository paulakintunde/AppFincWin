import fc from 'fast-check';
import { currencyCode, minorUnits } from '../../money/types';
import { percent } from '../../payoff/types';
import { prepareContext } from '../assess';
import { resolvePlanStrict } from '../plan';
import { defaultReserve } from '../reserve';
import { stackCheck } from '../position';
import type {
  AssessContext,
  BuyCheck,
  DebtRecord,
  DecideLimits,
  DecideSnapshot,
  InvestCheck,
  SplitRule,
  StackedCheckInput,
} from '../types';
import { USD, buyCash, income, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;
const CAD = currencyCode('CAD');

// ── fixtures rebuilt from 04-07 (assess.test.ts) ──
const D1: DebtRecord = {
  id: 'd1',
  balance: mu(800_000),
  minimumPayment: mu(20_000),
  secured: false,
  apr: percent('19.9'),
  currency: USD,
};
const D2: DebtRecord = {
  id: 'd2',
  balance: mu(15_000_000),
  minimumPayment: mu(90_000),
  secured: true,
  apr: percent('5.1'),
  currency: USD,
};
const B = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  snapshotOf({ debts: [D1, D2], monthlySaving: mu(25_000), monthlyInvesting: mu(40_000), ...over });
const LIMITS_BL: DecideLimits = {
  reserve: mu(600_000),
  dsrLine: percent('36'),
  unsecuredIncomeMultiple: 12,
  investingFloor: mu(40_000),
  savingFloor: mu(25_000),
  spareFloor: null,
};
const BL = (over: Partial<DecideSnapshot> = {}): DecideSnapshot => B({ limits: LIMITS_BL, ...over });
const PAY = income({
  seriesId: 'pay',
  freq: 'monthly',
  anchorDate: '2026-01-25',
  lastPaidDate: '2026-06-25',
  latestAmount: 600_000,
});
const INST = (a: number, over: Partial<BuyCheck> = {}): BuyCheck =>
  buyCash(12 * a, { payment: { method: 'instalment', instalmentAmount: mu(a), instalmentCount: 12 }, ...over });
const investMonthly = (monthly: number, n: number): InvestCheck => ({
  kind: 'invest',
  currency: USD,
  amount: mu(monthly),
  payment: { method: 'monthly', termMonths: n },
});
const investLump = (amount: number): InvestCheck => ({
  kind: 'invest',
  currency: USD,
  amount: mu(amount),
  payment: { method: 'lump' },
});
const loanCheck = (): BuyCheck =>
  buyCash(1_450_000, {
    payment: { method: 'loan', deposit: mu(300_000), termMonths: 48, apr: percent('9.4') },
  });

const others = (...checks: (BuyCheck | InvestCheck)[]): StackedCheckInput[] =>
  checks.map((check) => ({ check, purchaseRule: null }));
const one = (check: BuyCheck | InvestCheck, purchaseRule: SplitRule | null = null): StackedCheckInput => ({
  check,
  purchaseRule,
});

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error(`expected ok, got ${r.reasons.join(',')}`);
  return r.context;
}
const stack = (ctx: AssessContext, check: BuyCheck | InvestCheck, rule: SplitRule | null = null, index = 0) =>
  stackCheck(ctx, one(check, rule), index);

const HOUSEHOLD = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  BL({
    scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'mine' } },
    householdSpending: { rule: { kind: 'even' }, byCategory: [] },
    ...over,
  });

describe('stackCheck (D-41, D-41 amended, D-15, D-32, D-61)', () => {
  it('a cash check leaves all three cash figures and nothing else', () => {
    const base = ctxOf(BL());
    const { context: c, stacked } = stack(base, buyCash(300_000));
    expect(c.cashAvailable).toBe(base.cashAvailable - 300_000);
    expect(c.cashAfterBills).toBe(base.cashAfterBills - 300_000);
    expect(c.ledgerCash).toBe(base.ledgerCash - 300_000);
    expect(c.leftBefore).toBe(base.leftBefore);
    expect(c.leftThisMonth).toBe(base.leftThisMonth);
    expect(c.debtPayments).toBe(base.debtPayments);
    expect(c.monthCosts).toBe(base.monthCosts);
    expect(stacked).toEqual({ index: 0, status: 'applied', reasons: [], mineDayOne: 300_000, mineMonthly: 0 });
    expect(base.cashAvailable).toBe(2_000_000); // the input is never mutated
  });

  it('an instalment check joins payments and costs, lowers both left figures and recomputes an untyped reserve', () => {
    const base = ctxOf(B());
    const { context: c } = stack(base, INST(50_000));
    expect(c.debtPayments).toBe(base.debtPayments + 50_000);
    expect(c.monthCosts).toBe(base.monthCosts + 50_000);
    expect(c.leftBefore).toBe(base.leftBefore - 50_000);
    expect(c.leftThisMonth).toBe(base.leftThisMonth - 50_000);
    expect(c.cashAvailable).toBe(base.cashAvailable - 50_000);
    expect(c.cashAfterBills).toBe(base.cashAfterBills - 50_000);
    expect(c.ledgerCash).toBe(base.ledgerCash - 50_000);
    expect(c.unsecuredDebt).toBe(base.unsecuredDebt + 600_000);
    expect(c.debtBalance).toBe(base.debtBalance + 600_000);
    expect(c.monthCosts).toBe(460_000);
    expect(c.limits.reserve).toBe(defaultReserve(mu(460_000), 'steady'));
    expect(c.limits.reserve).toBe(1_380_000);
    const typed = stack(ctxOf(BL()), INST(50_000)).context;
    expect(typed.limits.reserve).toBe(600_000);
  });

  it('a loan check adds the financed amount and the plan monthly', () => {
    const base = ctxOf(BL());
    const plan = resolvePlanStrict(loanCheck());
    const { context: c } = stack(base, loanCheck());
    expect(plan.financed).toBe(1_150_000);
    expect(c.unsecuredDebt).toBe(base.unsecuredDebt + 1_150_000);
    expect(c.debtPayments).toBe(base.debtPayments + plan.monthly);
    expect(c.cashAvailable).toBe(base.cashAvailable - plan.dayOne);
  });

  it('running costs join spending, costs and the month', () => {
    const base = ctxOf(BL());
    const { context: c } = stack(base, buyCash(100_000, { runningCostsNet: mu(5_500) }));
    expect(c.mySpendingBasis).toBe(base.mySpendingBasis + 5_500);
    expect(c.monthCosts).toBe(base.monthCosts + 5_500);
    expect(c.leftBefore).toBe(base.leftBefore - 5_500);
    expect(c.leftThisMonth).toBe(base.leftThisMonth - 5_500);
  });

  it('a monthly invest check joins investing and the pausable amount (D-32)', () => {
    const base = ctxOf(BL());
    const { context: c, stacked } = stack(base, investMonthly(20_000, 24));
    expect(c.snapshot.monthlyInvesting).toBe(60_000);
    expect(c.pausable).toBe(base.pausable + 20_000);
    expect(c.leftBefore).toBe(base.leftBefore - 20_000);
    expect(c.leftThisMonth).toBe(base.leftThisMonth - 20_000);
    expect(c.debtPayments).toBe(base.debtPayments);
    expect(c.monthCosts).toBe(base.monthCosts);
    expect(c.unsecuredDebt).toBe(base.unsecuredDebt);
    expect(stacked.mineMonthly).toBe(20_000);
    expect(base.snapshot.monthlyInvesting).toBe(40_000);
  });

  it('a lump invest check leaves cash on day one only (D-62)', () => {
    const base = ctxOf(BL({ incomeSeries: [PAY] }));
    const { context: c, stacked } = stack(base, investLump(300_000));
    expect(c.cashAvailable).toBe(base.cashAvailable - 300_000);
    expect(c.cashAfterBills).toBe(base.cashAfterBills - 300_000);
    expect(c.ledgerCash).toBe(base.ledgerCash - 300_000);
    expect(c.snapshot.monthlyInvesting).toBe(base.snapshot.monthlyInvesting);
    expect(c.pausable).toBe(base.pausable);
    expect(c.leftBefore).toBe(base.leftBefore);
    expect(c.leftThisMonth).toBe(base.leftThisMonth);
    expect(c.debtPayments).toBe(base.debtPayments);
    expect(stacked).toEqual({ index: 0, status: 'applied', reasons: [], mineDayOne: 300_000, mineMonthly: 0 });
    expect(base.cashPath).not.toBeNull();
    for (let d = 0; d < base.cashPath!.balances.length; d += 1) {
      expect(c.cashPath!.balances[d]).toBe(base.cashPath!.balances[d]! - 300_000);
    }
  });

  it('a check with a missing plan is reported and changes nothing', () => {
    const base = ctxOf(BL());
    const missing = buyCash(1_000_000, { payment: { method: 'loan', deposit: mu(0), termMonths: null, apr: percent('9') } });
    const r = stack(base, missing, null, 2);
    expect(r.context).toBe(base);
    expect(r.stacked).toEqual({
      index: 2,
      status: 'missing',
      reasons: ['loan_term_missing'],
      mineDayOne: 0,
      mineMonthly: 0,
    });
  });

  it('household: an other check stacks at its own split (D-15)', () => {
    const base = ctxOf(HOUSEHOLD());
    const even = stack(base, buyCash(300_000), { kind: 'even' });
    expect(even.stacked.mineDayOne).toBe(150_000);
    expect(even.context.cashAvailable).toBe(base.cashAvailable - 150_000);
    const inst = stack(base, INST(50_000), { kind: 'even' });
    expect(inst.stacked.mineMonthly).toBe(25_000);
    expect(inst.context.unsecuredDebt).toBe(base.unsecuredDebt + 300_000);
    const mine = stack(base, buyCash(300_000), { kind: 'mine' });
    expect(mine.stacked.mineDayOne).toBe(300_000);
  });

  it('household: unresolvable weights are reported as missing; a missing or surplus rule throws', () => {
    const base = ctxOf(HOUSEHOLD());
    const r = stack(base, buyCash(300_000), { kind: 'weight', weights: [0, 0] });
    expect(r.context).toBe(base);
    expect(r.stacked.status).toBe('missing');
    expect(r.stacked.reasons).toEqual(['split_weights_zero']);
    expect(() => stack(base, buyCash(300_000), null)).toThrow(/^positionContext: /);
    expect(() => stack(ctxOf(BL()), buyCash(300_000), { kind: 'even' })).toThrow(/^positionContext: /);
  });

  it('refuses another currency', () => {
    expect(() => stack(ctxOf(BL()), buyCash(1, { currency: CAD }))).toThrow(/^positionContext: mixed currencies/);
  });

  it('stacked day-one costs are not the current purchase cash gap: cashAvailable drops, cashOnHand stays', () => {
    const base = ctxOf(BL({ incomeSeries: [PAY], cashOnHand: mu(1_000_000) }));
    const { context: c } = stack(base, buyCash(500_000));
    expect(c.cashAvailable).toBe(base.cashAvailable - 500_000);
    expect(c.snapshot.cashOnHand).toBe(1_000_000);
  });

  it('the cash path falls by the day-one cost from day 0; no path stays null', () => {
    const withPath = ctxOf(BL({ incomeSeries: [PAY] }));
    const { context: c } = stack(withPath, buyCash(300_000));
    expect(withPath.cashPath).not.toBeNull();
    c.cashPath!.balances.forEach((b, d) => expect(b).toBe(withPath.cashPath!.balances[d]! - 300_000));
    expect(stack(ctxOf(BL()), buyCash(300_000)).context.cashPath).toBeNull();
  });
});

describe('stacking properties (D-41 amended)', () => {
  const checkArb = fc.oneof(
    fc.integer({ min: 0, max: 1_500_000 }).map((p) => buyCash(p)),
    fc.integer({ min: 1, max: 60_000 }).map((a) => INST(a)),
    fc
      .tuple(fc.integer({ min: 0, max: 40_000 }), fc.integer({ min: 0, max: 1_500_000 }))
      .map(([r, p]) => buyCash(p, { runningCostsNet: mu(r) }))
  );
  const fold = (base: AssessContext, checks: readonly BuyCheck[]): AssessContext =>
    checks.reduce((c, check, i) => stack(c, check, null, i).context, base);
  const figures = (c: AssessContext) => [
    c.leftBefore,
    c.leftThisMonth,
    c.cashAvailable,
    c.cashAfterBills,
    c.ledgerCash,
    c.debtPayments,
    c.monthCosts,
    c.unsecuredDebt,
    c.debtBalance,
    c.limits.reserve,
  ];

  it('the totals do not depend on the order', () => {
    const base = ctxOf(B({ bills: [] }));
    fc.assert(
      fc.property(fc.array(checkArb, { minLength: 2, maxLength: 3 }), (checks) => {
        const forward = figures(fold(base, checks));
        const reversed = figures(fold(base, [...checks].reverse()));
        expect(reversed).toEqual(forward);
      }),
      { numRuns: 200 }
    );
  });

  it('a buy check never raises a left or cash figure and keeps the bills differences', () => {
    const base = ctxOf(BL());
    fc.assert(
      fc.property(checkArb, (check) => {
        const c = stack(base, check).context;
        expect(c.leftBefore).toBeLessThanOrEqual(base.leftBefore);
        expect(c.leftThisMonth).toBeLessThanOrEqual(base.leftThisMonth);
        expect(c.cashAvailable).toBeLessThanOrEqual(base.cashAvailable);
        expect(c.cashAfterBills).toBeLessThanOrEqual(base.cashAfterBills);
        expect(c.ledgerCash).toBeLessThanOrEqual(base.ledgerCash);
        expect(c.cashAvailable - c.cashAfterBills).toBe(base.cashAvailable - base.cashAfterBills);
        expect(c.ledgerCash - c.cashAfterBills).toBe(base.ledgerCash - base.cashAfterBills);
      }),
      { numRuns: 200 }
    );
  });

  it('others() builds personal inputs', () => {
    expect(others(buyCash(1))).toEqual([{ check: buyCash(1), purchaseRule: null }]);
  });
});
