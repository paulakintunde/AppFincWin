import fc from 'fast-check';
import { currencyCode, minorUnits } from '../../money/types';
import { percent } from '../../payoff/types';
import { assess, prepareContext } from '../assess';
import { resolvePlanStrict } from '../plan';
import { defaultReserve } from '../reserve';
import { applyChanges, positionContext, stackCheck } from '../position';
import type {
  AssessContext,
  BuyCheck,
  DebtRecord,
  DecideLimits,
  DecideSnapshot,
  FutureChange,
  InvestCheck,
  SplitRule,
  StackedCheckInput,
} from '../types';
import { USD, buyCash, income, monthsOf, snapshotOf } from './helpers/fixtures';

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

// ── Task 2: future changes, lost income, positionContext, assess ──
const change = (
  over: Partial<FutureChange> & Pick<FutureChange, 'kind' | 'monthlyAmount' | 'startMonth'>
): FutureChange => ({
  id: 'c1',
  endMonth: null,
  currency: USD,
  ...over,
});
const R = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  BL({
    months: monthsOf(
      [
        [1_000_000, 700_000],
        [1_000_000, 700_000],
        [1_000_000, 700_000],
      ],
      '2026-04'
    ),
    ...over,
  });
const lossOf = (monthlyAmount: number, startDate = '2026-08-15') => ({
  monthlyAmount: mu(monthlyAmount),
  startDate,
  likelihood: 'likely' as const,
});
const loanMissing = (over: Partial<BuyCheck> = {}): BuyCheck =>
  buyCash(100_000, { payment: { method: 'loan', deposit: mu(0), termMonths: null, apr: percent('9') }, ...over });

describe('applyChanges (D-45)', () => {
  it('no changes leave the figures and record the position', () => {
    const base = ctxOf(B());
    const c = applyChanges(base, [], [], false);
    expect(c.monthIncome).toBe(base.monthIncome);
    expect(c.mySpendingBasis).toBe(base.mySpendingBasis);
    expect(c.leftBefore).toBe(base.leftBefore);
    expect(c.position).toEqual({
      stacked: [],
      changes: [],
      worstMonth: {
        month: '2026-08',
        offset: 1,
        income: base.monthIncome,
        spending: base.mySpendingBasis,
        leftBefore: base.leftBefore,
        incomeDelta: 0,
        spendingDelta: 0,
      },
      expectedIncomeIncluded: false,
    });
  });

  it('a spending change moves the month test, never leftThisMonth or the income basis', () => {
    const base = ctxOf(BL());
    const c = applyChanges(
      base,
      [change({ kind: 'spending', monthlyAmount: mu(150_000), startMonth: '2026-11' })],
      [],
      false
    );
    expect(c.leftBefore).toBe(-25_000);
    expect(c.mySpendingBasis).toBe(450_000);
    expect(c.monthIncome).toBe(600_000);
    expect(c.position!.worstMonth.month).toBe('2026-11');
    expect(c.leftThisMonth).toBe(125_000);
    expect(c.money.incomeBasis).toBe(base.money.incomeBasis);
  });
});

describe('positionContext (D-41, D-45, D-53)', () => {
  it('with no other checks the combined and standalone figures are equal', () => {
    const base = ctxOf(BL());
    const p = positionContext(base, buyCash(100_000), []);
    expect(p.combined).toEqual(p.standalone);
    expect(p.stacked).toEqual([]);
    expect(() => positionContext(p.combined, buyCash(100_000), [])).toThrow(
      /^positionContext: context is already positioned/
    );
  });

  it('reads and validates the snapshot future changes', () => {
    const s = BL({ futureChanges: [change({ kind: 'spending', monthlyAmount: mu(150_000), startMonth: '2026-11' })] });
    const p = positionContext(ctxOf(s), buyCash(100_000), []);
    expect(p.combined.leftBefore).toBe(-25_000);
    expect(p.standalone.leftBefore).toBe(-25_000);
    const bad = BL({
      futureChanges: [change({ kind: 'spending', monthlyAmount: mu(1), startMonth: '2026-11', currency: CAD })],
    });
    expect(() => positionContext(ctxOf(bad), buyCash(1), [])).toThrow(/mixed currencies/);
  });

  it('a negative purchase income change is applied to combined and standalone (D-53)', () => {
    const p = positionContext(ctxOf(BL()), buyCash(100_000, { incomeChange: lossOf(-150_000) }), []);
    const expected = {
      id: 'purchase_income',
      kind: 'income',
      monthlyAmount: -150_000,
      startMonth: '2026-08',
      endMonth: null,
      currency: USD,
    };
    expect(p.combined.position!.changes).toEqual([expected]);
    expect(p.standalone.position!.changes).toEqual([expected]);
    expect(p.combined.leftBefore).toBe(-25_000);
    expect(p.combined.monthIncome).toBe(450_000);
  });

  it('a positive change is left out unless asked (D-53)', () => {
    const check = buyCash(100_000, { incomeChange: lossOf(400_000) });
    const off = positionContext(ctxOf(BL()), check, []);
    expect(off.combined.monthIncome).toBe(600_000);
    expect(off.combined.position!.expectedIncomeIncluded).toBe(false);
    expect(off.combined.position!.changes).toEqual([]);
    const on = positionContext(ctxOf(BL()), check, [], { includeExpectedIncome: true });
    expect(on.combined.monthIncome).toBe(1_000_000);
    expect(on.combined.position!.expectedIncomeIncluded).toBe(true);
    expect(on.standalone.monthIncome).toBe(1_000_000);
    const explicitOff = positionContext(ctxOf(BL()), check, [], { includeExpectedIncome: false });
    expect(explicitOff.combined.monthIncome).toBe(600_000);
  });

  it('an other check negative income change applies to the combined position only; a missing one is ignored', () => {
    const loss = buyCash(100_000, { incomeChange: lossOf(-150_000) });
    const p = positionContext(ctxOf(BL()), buyCash(100_000), [
      one(loss),
      one(buyCash(1, { incomeChange: lossOf(100_000) })),
    ]);
    expect(p.combined.monthIncome).toBe(450_000);
    expect(p.combined.position!.changes.map((c) => c.id)).toEqual(['other-0-income']);
    expect(p.standalone.monthIncome).toBe(600_000);
    const q = positionContext(ctxOf(BL()), buyCash(100_000), [one(loanMissing({ incomeChange: lossOf(-150_000) }))]);
    expect(q.combined.monthIncome).toBe(600_000);
    expect(q.stacked[0]!.status).toBe('missing');
  });

  it('an invalid income change is refused', () => {
    expect(() => positionContext(ctxOf(BL()), buyCash(1, { incomeChange: lossOf(0) }), [])).toThrow(
      /^positionContext: /
    );
    expect(() => positionContext(ctxOf(BL()), buyCash(1, { incomeChange: lossOf(-5, '2026-13-40') }), [])).toThrow(
      /^positionContext: /
    );
  });
});

describe('assess on the combined position (D-41, D-62, D-36)', () => {
  it('assess(s, c) equals assess(s, c, [])', () => {
    expect(assess(BL(), INST(10_000))).toEqual(assess(BL(), INST(10_000), []));
  });

  it('judges the combined position while the standalone figures fit', () => {
    const v = assess(BL(), buyCash(100_000), others(buyCash(1_800_000)));
    if (v.state === 'missing') throw new Error('expected a verdict');
    expect(v.state).toBe('adjust');
    expect(v.cashAfter).toBe(100_000);
    expect(v.warnings.map((w) => w.code)).toContain('cash');
    expect(assess(BL(), buyCash(100_000)).state).toBe('fits');
  });

  it('a stacked monthly invest check deepens the pause (D-62, D-32)', () => {
    const stackedInput: StackedCheckInput = { check: investMonthly(20_000, 24), purchaseRule: null };
    const v = assess(R(), INST(150_000), [stackedInput]);
    if (v.state === 'missing') throw new Error('expected a verdict');
    expect(v.context.position!.stacked).toEqual([
      { index: 0, status: 'applied', reasons: [], mineDayOne: 0, mineMonthly: 20_000 },
    ]);
    expect(v.context.snapshot.monthlyInvesting).toBe(60_000);
    expect(v.context.pausable).toBe(85_000);
    expect(v.context.leftBefore).toBe(105_000);
    expect(v.left).toBe(-45_000);
    expect(v.investingAtRisk).toBe(45_000);
    expect(v.savingAtRisk).toBe(0);
    expect(v.investingAfter).toBe(15_000);
    expect(v.remainingShortfall).toBe(0);
    expect(v.cashAfter).toBe(1_850_000);
    expect(v.debtServiceAfter).toBe(260_000);
    expect(v.warnings).toEqual([{ code: 'inv', shortfall: 45_000 }]);
    expect(v.state).toBe('adjust');
    const alone = assess(R(), INST(150_000));
    if (alone.state === 'missing') throw new Error('expected a verdict');
    expect(alone.warnings).toEqual([{ code: 'inv', shortfall: 25_000 }]);
  });

  it('a missing current plan carries the size from the combined context', () => {
    const v = assess(BL(), loanMissing(), others(INST(50_000)));
    expect(v.state).toBe('missing');
    expect(v.size).toBe('from_savings'); // this month 125_000 - 50_000 = 75_000 < 100_000
    expect(assess(BL(), loanMissing()).size).toBe('from_spare_this_month');
  });

  it('D-36 reads this month, not the worst month', () => {
    const worse = BL({
      futureChanges: [change({ kind: 'spending', monthlyAmount: mu(150_000), startMonth: '2026-11' })],
    });
    const v = assess(worse, buyCash(100_000));
    if (v.state === 'missing') throw new Error('expected a verdict');
    expect(v.context.leftBefore).toBe(-25_000);
    expect(v.context.leftThisMonth).toBe(125_000);
    expect(v.size).toBe('from_spare_this_month');
    const stackedV = assess(BL(), buyCash(100_000), others(INST(50_000)));
    if (stackedV.state === 'missing') throw new Error('expected a verdict');
    expect(stackedV.context.leftThisMonth).toBe(75_000);
    expect(stackedV.size).toBe('from_savings');
  });

  it('an unresolved context still yields a missing verdict', () => {
    const v = assess(BL({ months: [] }), buyCash(1), others(buyCash(1)));
    expect(v.state).toBe('missing');
  });
});
