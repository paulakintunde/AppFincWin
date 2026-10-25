import { currencyCode, minorUnits } from '../../money/types';
import { divideHalfUp } from '../../money/rounding';
import { ONE_HUNDRED_PERCENT, ZERO_PERCENT, percent } from '../../payoff/types';
import { SIMULATION_MONTH_CAP } from '../constants';
import { assess, assessPlan, prepareContext } from '../assess';
import { lineMargins, decide } from '../decision';
import { paybackMonths } from '../payback';
import { resolvePlanStrict } from '../plan';
import { positionContext } from '../position';
import { stressTest } from '../stress';
import { myPart, resolveShare } from '../share';
import type {
  AssessContext,
  Assessment,
  BuyCheck,
  DebtRecord,
  DecideLimits,
  DecideSnapshot,
  FutureChange,
  InvestCheck,
  PurchaseCheck,
} from '../types';
import { USD, bill, buyCash, income, monthsOf, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;

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
const LIMITS_BL: DecideLimits = {
  reserve: mu(600_000),
  dsrLine: percent('36'),
  housingLine: null,
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
const PAY = income({
  seriesId: 'pay',
  freq: 'monthly',
  anchorDate: '2026-01-25',
  lastPaidDate: '2026-06-25',
  latestAmount: 600_000,
});
const PB = (over: Partial<DecideSnapshot> = {}): DecideSnapshot => BL({ incomeSeries: [PAY], ...over });
const BILL_BEFORE_PAY = bill({
  seriesId: 's-ins',
  freq: 'yearly',
  anchorDate: '2025-07-24',
  lastPaidDate: '2025-07-24',
  latestAmount: 120_000,
});
const ZERO_LOAN = (price: number): BuyCheck =>
  buyCash(price, { payment: { method: 'loan', deposit: mu(0), termMonths: 12, apr: ZERO_PERCENT } });
const TIGHT = (): DecideSnapshot =>
  PB({ cashOnHand: mu(150_000), limits: { ...LIMITS_BL, reserve: mu(0) } });

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error('expected a resolved context');
  return r.context;
}
function run(s: DecideSnapshot, c: PurchaseCheck): Assessment {
  const v = assess(s, c);
  if (v.state === 'missing') throw new Error('expected a resolved verdict');
  return v;
}
function marginOf(a: Assessment, c: PurchaseCheck, line: string) {
  return lineMargins(a, c).find((m) => m.line === line);
}
const other = (check: PurchaseCheck): { check: PurchaseCheck; purchaseRule: null } => ({ check, purchaseRule: null });
const change = (id: string, kind: 'income' | 'spending', amount: number, startMonth: string): FutureChange => ({
  id,
  kind,
  monthlyAmount: mu(amount),
  startMonth,
  endMonth: null,
  currency: USD,
});

describe('lineMargins (D-43, D-33)', () => {
  it('cash margin 29_999 against the 600_000 reserve is on the edge, 30_000 exactly is not', () => {
    const near = run(BL(), buyCash(1_370_001));
    expect(near.state).toBe('fits');
    expect(marginOf(near, buyCash(1_370_001), 'cash')).toEqual({
      line: 'cash',
      margin: 29_999,
      threshold: 600_000,
      base: 600_000,
      flag: 'on_edge',
    });
    const exact = run(BL(), buyCash(1_370_000));
    expect(marginOf(exact, buyCash(1_370_000), 'cash')!.margin).toBe(30_000);
    expect(marginOf(exact, buyCash(1_370_000), 'cash')!.flag).toBeNull();
  });

  it('a buy check lists month, cash, dsr, owe, inv in order, with no cash_path when there is no path', () => {
    const c = buyCash(100_000);
    const a = run(BL(), c);
    const ms = lineMargins(a, c);
    expect(ms.map((m) => m.line)).toEqual(['month', 'cash', 'dsr', 'owe', 'inv']);
    expect(ms[0]).toEqual({ line: 'month', margin: 125_000, threshold: 0, base: 410_000, flag: null });
  });

  it('measures dsr, owe and inv against their own lines', () => {
    const c = buyCash(100_000);
    const a = run(BL(), c);
    const dsr = divideHalfUp(percent('36') * BigInt(a.context.money.incomeBasis), ONE_HUNDRED_PERCENT);
    expect(marginOf(a, c, 'dsr')).toMatchObject({
      margin: Number(dsr) - a.debtServiceAfter,
      threshold: Number(dsr),
    });
    expect(marginOf(a, c, 'owe')).toMatchObject({
      margin: a.context.limits.unsecuredLine - a.unsecuredAfter,
      threshold: a.context.limits.unsecuredLine,
    });
    expect(marginOf(a, c, 'inv')).toMatchObject({
      margin: a.investingAfter - 40_000,
      threshold: 40_000,
    });
  });

  it('keeps the dsr entry when there is no income basis: the line is 0 and debt service fails it (ME-05)', () => {
    const s = BL({ months: monthsOf([[0, 300_000], [0, 300_000], [0, 300_000]], '2026-04') });
    const c = buyCash(100_000);
    const a = run(s, c);
    expect(a.context.money.incomeBasis).toBe(0);
    const margins = lineMargins(a, c);
    expect(margins.map((m) => m.line)).toEqual(['month', 'cash', 'dsr', 'owe', 'inv']);
    expect(margins.find((m) => m.line === 'dsr')).toMatchObject({ threshold: 0, margin: -a.debtServiceAfter });
  });

  it('invest checks report only month and cash (+ cash_path)', () => {
    const c: InvestCheck = { kind: 'invest', currency: USD, amount: mu(100_000), payment: { method: 'lump' } };
    const a = run(BL(), c);
    expect(lineMargins(a, c).map((m) => m.line)).toEqual(['month', 'cash']);
    const p = run(PB(), c);
    expect(lineMargins(p, c).map((m) => m.line)).toEqual(['month', 'cash', 'cash_path']);
  });

  it('cash_path margin is the D-59 room when the purchase does not breach it', () => {
    const c = buyCash(100_000);
    const a = run(PB(), c);
    expect(marginOf(a, c, 'cash_path')).toEqual({
      line: 'cash_path',
      margin: 1_097_808,
      threshold: 600_000,
      base: 600_000,
      flag: null,
    });
  });

  it('cash_path margin is minus the cash_dip shortfall when a dip fires', () => {
    const c = buyCash(1_300_000);
    const a = run(PB({ bills: [BILL_BEFORE_PAY] }), c);
    expect(a.warnings).toContainEqual({ code: 'cash_dip', shortfall: 222_192 });
    expect(marginOf(a, c, 'cash_path')).toMatchObject({ margin: -222_192, flag: null });
  });

  it('a purchase that does not lower the low is passed, not failed (W3)', () => {
    const c = ZERO_LOAN(120_000);
    const a = run(TIGHT(), c);
    expect(a.state).toBe('fits');
    expect(a.warnings).toEqual([]);
    expect(marginOf(a, c, 'cash_path')).toMatchObject({ margin: 0, base: 410_000, flag: 'on_edge' });
  });

  it('a purchase that does not lower the low reads its room when there is room', () => {
    const c = ZERO_LOAN(120_000);
    const a = run(PB(), c);
    if (a.cashPath.status !== 'available') throw new Error('expected a path');
    expect(a.cashPath.lowestWith.amount).toBe(1_797_808);
    expect(a.cashPath.lowestWithout.amount).toBe(1_797_808);
    expect(marginOf(a, c, 'cash_path')!.margin).toBe(1_197_808);
  });
});

describe('decide (DEC-06)', () => {
  it('the verdict deep-equals assess, with and without other checks', () => {
    const c = buyCash(100_000);
    expect(decide(BL(), c).verdict).toEqual(assess(BL(), c));
    const others = [other(buyCash(1_800_000))];
    expect(decide(BL(), c, others).verdict).toEqual(assess(BL(), c, others));
  });

  it('no other checks: standalone null, combinedDiffers false, stacked empty', () => {
    const d = decide(BL(), buyCash(100_000));
    expect(d.standalone).toBeNull();
    expect(d.combinedDiffers).toBe(false);
    expect(d.stacked).toEqual([]);
  });

  it('an open check can change the combined state while the standalone one fits', () => {
    const d = decide(BL(), buyCash(100_000), [other(buyCash(1_800_000))]);
    expect(d.verdict.state).toBe('adjust');
    expect(d.standalone!.state).toBe('fits');
    expect(d.combinedDiffers).toBe(true);
    expect(d.stacked).toHaveLength(1);
    expect(d.stacked[0]).toMatchObject({ index: 0, status: 'applied' });
  });

  it('reports the worst future month beside now', () => {
    const d = decide(BL({ futureChanges: [change('f1', 'spending', 150_000, '2026-11')] }), buyCash(100_000));
    expect(d.worstMonth).toEqual({
      month: '2026-11',
      offset: 4,
      leftAfter: -25_000,
      leftAfterNow: 125_000,
      shortfall: 25_000,
      differsFromNow: true,
    });
    const flat = decide(BL(), buyCash(100_000)).worstMonth!;
    expect(flat.differsFromNow).toBe(false);
    expect(flat.shortfall).toBe(0);
  });

  it('margins are lineMargins of the verdict', () => {
    const c = buyCash(1_370_001);
    const d = decide(BL(), c);
    expect(d.margins).toEqual(lineMargins(d.verdict as Assessment, c));
  });

  it('stress is stressTest on the combined context, and empty otherwise', () => {
    const c = buyCash(1_450_000, {
      payment: { method: 'loan', deposit: mu(300_000), termMonths: 48, apr: percent('9.4'), variable: true },
    });
    const d = decide(BL(), c);
    expect(d.stress).toEqual(stressTest((d.verdict as Assessment).context, c));
    expect(d.stress).toHaveLength(2);
    expect(decide(BL(), buyCash(100_000)).stress).toEqual([]);
  });

  describe('withExpectedIncome (D-53)', () => {
    const gain = { monthlyAmount: mu(400_000), startDate: '2026-08-01', likelihood: 'uncertain' as const };
    const snap = BL({
      months: monthsOf([[1_000_000, 300_000], [1_000_000, 300_000], [1_000_000, 300_000]], '2026-04'),
    });

    it('carries a separate assessment with the gain, its likelihood and the payback', () => {
      const c = buyCash(1_200_000, { incomeChange: gain });
      const d = decide(snap, c);
      const w = d.withExpectedIncome!;
      expect(w.monthlyAmount).toBe(400_000);
      expect(w.likelihood).toBe('uncertain');
      expect(w.startMonth).toBe('2026-08');
      // the worst of the next 12 months includes the gain from August (D-45 applied to the separate assessment)
      expect(w.assessment.context.monthIncome).toBe(1_400_000);
      expect((d.verdict as Assessment).context.monthIncome).toBe(1_000_000);
      const plan = resolvePlanStrict(c);
      const share = resolveShare(snap.scope);
      if (!share.ok) throw new Error('share');
      expect(w.payback).toEqual(
        paybackMonths({
          asOf: snap.asOf,
          plan,
          runningNet: c.runningCostsNet,
          share: share.share,
          change: gain,
          horizonMonths: SIMULATION_MONTH_CAP,
        })
      );
    });

    it('never puts the gain in the main verdict', () => {
      const withGain = decide(snap, buyCash(1_200_000, { incomeChange: gain })).verdict as Assessment;
      const without = decide(snap, buyCash(1_200_000)).verdict as Assessment;
      expect(withGain).toEqual(without);
    });

    it('is null for a negative change, none, an invest check or a missing plan', () => {
      const loss = { ...gain, monthlyAmount: mu(-400_000) };
      expect(decide(snap, buyCash(1_200_000, { incomeChange: loss })).withExpectedIncome).toBeNull();
      expect(decide(snap, buyCash(1_200_000)).withExpectedIncome).toBeNull();
      const inv: InvestCheck = { kind: 'invest', currency: USD, amount: mu(100_000), payment: { method: 'lump' } };
      expect(decide(snap, inv).withExpectedIncome).toBeNull();
      const noPlan = buyCash(100_000, {
        payment: { method: 'loan', deposit: mu(0), termMonths: null, apr: percent('9') },
        incomeChange: gain,
      });
      expect(decide(snap, noPlan).withExpectedIncome).toBeNull();
    });
  });

  describe('missing', () => {
    it('no full month: missing with rough confidence, everything else empty', () => {
      const s = BL({ months: [] });
      const c = buyCash(100_000);
      const miss = {
        state: 'missing',
        reasons: ['no_full_month'],
        size: null,
        confidence: { level: 'rough', reasons: ['under_3_full_months'] },
      };
      const d = decide(s, c);
      expect(d.verdict).toEqual(miss);
      expect(d.standalone).toBeNull();
      expect(d).toMatchObject({ worstMonth: null, margins: [], stress: [], withExpectedIncome: null, stacked: [] });
      expect(decide(s, c, [other(buyCash(1))]).standalone).toEqual(miss);
    });

    it('only the split is zero: fair confidence from the money basis, not under_3_full_months (W4)', () => {
      const s = BL({
        scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [0, 0] } },
        householdSpending: { rule: { kind: 'even' }, byCategory: [] },
      });
      expect(decide(s, buyCash(100_000)).verdict).toEqual({
        state: 'missing',
        reasons: ['split_weights_zero'],
        size: null,
        confidence: { level: 'fair', reasons: ['under_6_full_months'] },
      });
    });

    it('an invest check with no term is missing with its size', () => {
      const inv: InvestCheck = {
        kind: 'invest',
        currency: USD,
        amount: mu(100_000),
        payment: { method: 'monthly', termMonths: null },
      };
      expect(decide(BL(), inv).verdict).toMatchObject({ state: 'missing', size: 'from_spare_this_month' });
    });

    it('a missing plan on a resolvable context reports the stacked checks and the size', () => {
      const c = buyCash(100_000, { payment: { method: 'loan', deposit: mu(0), termMonths: null, apr: percent('9') } });
      const d = decide(BL(), c, [other(buyCash(1_800_000))]);
      expect(d.verdict).toEqual(assess(BL(), c, [other(buyCash(1_800_000))]));
      expect(d.standalone).toMatchObject({ state: 'missing', size: 'from_spare_this_month' });
      expect(d.stacked).toHaveLength(1);
      expect(d.worstMonth).toBeNull();
      expect(d.margins).toEqual([]);
      const alone = decide(BL(), c);
      expect(alone.standalone).toBeNull();
      expect(alone.verdict).toMatchObject({ state: 'missing', size: 'from_spare_this_month' });
    });
  });

  it('rejects a check in another currency', () => {
    const c = buyCash(100_000);
    expect(() => decide(BL(), { ...c, currency: currencyCode('CAD') })).toThrow(RangeError);
  });

  it('uses positionContext for the same stacked figures as assess', () => {
    const c = buyCash(100_000);
    const others = [other(buyCash(1_800_000))];
    const pos = positionContext(ctxOf(BL()), c, others);
    const expected = assessPlan(pos.combined, c, resolvePlanStrict(c));
    expect(decide(BL(), c, others).verdict).toEqual(expected);
    expect(myPart(c.price, pos.combined.purchaseShare)).toBe(100_000);
  });
});

describe('D-103 housing margin', () => {
  const property = (running: number): BuyCheck => buyCash(1_000, { itemType: 'property', runningCostsNet: mu(running) });
  const HOUSED = (): DecideSnapshot => BL({ housingMonthly: mu(100_000) });

  it('D-103 lineMargins adds a housing margin for property checks only and flags the edge', () => {
    // income basis 600_000, so the 28% line is 168_000; housing after = 100_000 + 67_000 = 167_000
    const c = property(67_000);
    const a = run(HOUSED(), c);
    const ms = lineMargins(a, c);
    expect(ms.map((m) => m.line)).toEqual(['month', 'cash', 'dsr', 'housing', 'owe', 'inv']);
    // 1_000 of room against a 168_000 line is 0.6%: inside the 5% edge
    expect(ms.find((m) => m.line === 'housing')).toEqual({
      line: 'housing',
      margin: 1_000,
      threshold: 168_000,
      base: 168_000,
      flag: 'on_edge',
    });
    const roomy = property(10_000);
    expect(marginOf(run(HOUSED(), roomy), roomy, 'housing')).toMatchObject({ margin: 58_000, flag: null });
    const over = property(70_000);
    expect(marginOf(run(HOUSED(), over), over, 'housing')).toMatchObject({ margin: -2_000, flag: 'on_edge' });
    // other buy checks and invest checks carry no housing margin
    const general = buyCash(100_000);
    expect(lineMargins(run(HOUSED(), general), general).some((m) => m.line === 'housing')).toBe(false);
    const inv: InvestCheck = { kind: 'invest', currency: USD, amount: mu(100_000), payment: { method: 'lump' } };
    expect(lineMargins(run(HOUSED(), inv), inv).some((m) => m.line === 'housing')).toBe(false);
  });

  it('D-103 with no income the housing line in money is 0 and housing fails it by its whole amount', () => {
    const s = BL({ housingMonthly: mu(100_000), months: monthsOf([[0, 300_000], [0, 300_000], [0, 300_000]], '2026-04') });
    const c = property(5_000);
    const a = run(s, c);
    expect(marginOf(a, c, 'housing')).toMatchObject({ threshold: 0, margin: -105_000 });
  });
});
