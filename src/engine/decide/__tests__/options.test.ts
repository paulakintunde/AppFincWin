import { divideHalfUp } from '../../money/rounding';
import { minorUnits } from '../../money/types';
import { futureValue } from '../../payoff/futureValue';
import { ONE_HUNDRED_PERCENT, ZERO_PERCENT, percent, percentFromScaled } from '../../payoff/types';
import { assessPlan, prepareContext } from '../assess';
import { buildOptions } from '../options';
import { resolvePlanStrict } from '../plan';
import type {
  AssessContext,
  BuyCheck,
  DebtRecord,
  DecideLimits,
  DecideOption,
  DecideSnapshot,
  InvestCheck,
  PurchaseCheck,
} from '../types';
import { USD, bill, buyCash, income, monthsOf, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;

// ── shared fixtures (the 04-07 set) ──
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
const R = (over: Partial<DecideSnapshot> = {}): DecideSnapshot =>
  BL({
    months: monthsOf([
      [1_000_000, 700_000],
      [1_000_000, 700_000],
      [1_000_000, 700_000],
    ]),
    ...over,
  });
const INST = (a: number, over: Partial<BuyCheck> = {}): BuyCheck =>
  buyCash(12 * a, { payment: { method: 'instalment', instalmentAmount: mu(a), instalmentCount: 12 }, ...over });
const LOAN = (price: number, deposit: number, termMonths: number, apr = ZERO_PERCENT): BuyCheck =>
  buyCash(price, { payment: { method: 'loan', deposit: mu(deposit), termMonths, apr } });
const investMonthly = (monthly: number, n: number): InvestCheck => ({
  kind: 'invest',
  currency: USD,
  amount: mu(monthly),
  payment: { method: 'monthly', termMonths: n },
});

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error(`expected ok, got ${r.reasons.join(',')}`);
  return r.context;
}
function optionsOf(s: DecideSnapshot, check: PurchaseCheck): readonly DecideOption[] {
  const ctx = ctxOf(s);
  return buildOptions(ctx, check, assessPlan(ctx, check, resolvePlanStrict(check)));
}
function pick<C extends DecideOption['code']>(opts: readonly DecideOption[], code: C): Extract<DecideOption, { code: C }> {
  const found = opts.find((o) => o.code === code);
  if (!found) throw new Error(`no ${code} option in ${opts.map((o) => o.code).join(',')}`);
  return found as Extract<DecideOption, { code: C }>;
}
const codes = (opts: readonly DecideOption[]) => opts.map((o) => o.code);

const LINES = [
  { lineId: 'a', averageMonthly: mu(50_000), cuttable: true },
  { lineId: 'b', averageMonthly: mu(80_000), cuttable: false },
  { lineId: 'c', averageMonthly: mu(30_000), cuttable: true },
  { lineId: 'd', averageMonthly: mu(30_000), cuttable: true },
];
// 4M on a 12-month 0% loan with 1.7M down: cash after 300_000 (cushion 600_000), monthly 191_667 against left 125_000
const BIG_LOAN = LOAN(4_000_000, 1_700_000, 12);

describe('buildOptions order and content (DEC-13, D-19)', () => {
  it('is empty when the verdict fits', () => {
    expect(optionsOf(BL(), buyCash(100_000))).toEqual([]);
  });

  it('comes out in the brief order', () => {
    const o = optionsOf(BL({ expenseLines: LINES }), BIG_LOAN);
    expect(codes(o)).toEqual([
      'affordable_price',
      'longer_term',
      'cut_line',
      'cut_line',
      'earn_more',
      'save_first',
      'do_without',
    ]);
  });

  it('affordable_price carries the exact price and the reduction', () => {
    const o = optionsOf(BL(), BIG_LOAN);
    expect(pick(o, 'affordable_price')).toEqual({ code: 'affordable_price', price: 1_400_000, reduction: 2_600_000 });
  });

  it('omits affordable_price for nothing_affordable, for found 0 and for an invest check', () => {
    const poor = BL({ cashOnHand: mu(500_000) });
    expect(codes(optionsOf(poor, buyCash(100_000)))).not.toContain('affordable_price');
    const edge = BL({ cashOnHand: mu(600_000) });
    expect(codes(optionsOf(edge, buyCash(100_000)))).not.toContain('affordable_price');
    expect(codes(optionsOf(R(), investMonthly(700_000, 12)))).not.toContain('affordable_price');
  });

  it('longer_term re-resolves the plan 24 months out', () => {
    const o = pick(optionsOf(BL(), BIG_LOAN), 'longer_term');
    expect(o.termMonths).toBe(36);
    expect(o.monthlyPayment).toBe(63_889);
    expect(o.leftAfter).toBe(125_000 - 63_889);
    expect(o.monthCloses).toBe(true);
    expect(o.leftChange).toBe(125_000 - 63_889 - (125_000 - 191_667));
    expect(o.extraInterest).toBe(0);
  });

  it('longer_term charges extra interest at a non-zero rate and caps at 600 months', () => {
    const o = pick(optionsOf(BL(), LOAN(4_000_000, 1_700_000, 12, percent('6'))), 'longer_term');
    expect(o.extraInterest).toBeGreaterThan(0);
    expect(pick(optionsOf(BL(), LOAN(4_000_000, 1_700_000, 590)), 'longer_term').termMonths).toBe(600);
    expect(codes(optionsOf(BL(), LOAN(4_000_000, 1_700_000, 600)))).not.toContain('longer_term');
  });

  it('longer_term is only for loans', () => {
    expect(codes(optionsOf(R(), INST(150_000)))).not.toContain('longer_term');
    expect(codes(optionsOf(BL(), buyCash(1_700_000)))).not.toContain('longer_term');
    expect(codes(optionsOf(R(), investMonthly(700_000, 12)))).not.toContain('longer_term');
  });

  it('cut_line takes the two largest cuttable lines, ties broken by line id', () => {
    const cuts = optionsOf(BL({ expenseLines: LINES }), BIG_LOAN).filter((o) => o.code === 'cut_line');
    expect(cuts).toEqual([
      { code: 'cut_line', lineId: 'a', lineAverage: 50_000, cut: 10_000, gap: 66_667, closesGap: false },
      { code: 'cut_line', lineId: 'c', lineAverage: 30_000, cut: 6_000, gap: 66_667, closesGap: false },
    ]);
  });

  it('cut_line skips zero lines and reports closesGap when the cut covers the gap', () => {
    const lines = [
      { lineId: 'zero', averageMonthly: mu(0), cuttable: true },
      { lineId: 'big', averageMonthly: mu(400_000), cuttable: true },
    ];
    const cuts = optionsOf(R({ expenseLines: lines }), INST(150_000)).filter((o) => o.code === 'cut_line');
    expect(cuts).toEqual([
      { code: 'cut_line', lineId: 'big', lineAverage: 400_000, cut: 80_000, gap: 25_000, closesGap: true },
    ]);
  });

  it('earn_more states the gap as a share of money in', () => {
    const o = pick(optionsOf(BL(), BIG_LOAN), 'earn_more');
    expect(o.gap).toBe(66_667);
    expect(o.basis).toBe('average');
    expect(o.incomeBasis).toBe(600_000);
    expect(o.percentOfIncome).toBe(percentFromScaled(divideHalfUp(66_667n * ONE_HUNDRED_PERCENT, 600_000n)));
  });

  it('earn_more has a null percent when money in is zero', () => {
    const s = BL({
      months: monthsOf([
        [0, 100_000],
        [0, 100_000],
        [0, 100_000],
      ]),
    });
    const o = pick(optionsOf(s, buyCash(100_000)), 'earn_more');
    expect(o.incomeBasis).toBe(0);
    expect(o.percentOfIncome).toBeNull();
  });

  it('omits earn_more when the month has no gap, and cut_line then closes nothing', () => {
    const o = optionsOf(BL({ expenseLines: LINES }), buyCash(1_700_000));
    expect(codes(o)).toEqual(['affordable_price', 'cut_line', 'cut_line', 'save_first', 'do_without']);
    expect(pick(o, 'cut_line')).toMatchObject({ gap: 0, closesGap: false });
  });

  it('save_first measures the cash need and the months to save it', () => {
    expect(pick(optionsOf(BL(), buyCash(1_700_000)), 'save_first')).toEqual({
      code: 'save_first',
      need: 300_000,
      monthlySpare: 125_000,
      months: 3,
    });
  });

  it('save_first deducts bills due within 90 days (D-24)', () => {
    const o = pick(optionsOf(BL({ bills: [YEARLY_DUE] }), buyCash(1_700_000)), 'save_first');
    expect(o.need).toBe(420_000);
  });

  it('save_first still deducts the bill when a pay series gives a cash path (D-24, D-44)', () => {
    const s = PB({ bills: [YEARLY_DUE] });
    const ctx = ctxOf(s);
    const check = buyCash(1_700_000);
    const a = assessPlan(ctx, check, resolvePlanStrict(check));
    expect(a.cashAfter).toBe(300_000);
    expect(a.cashAfterBillsAndPurchase).toBe(180_000);
    expect(pick(buildOptions(ctx, check, a), 'save_first').need).toBe(420_000);
  });

  it('pause-only adjust still gets options sized on the pre-pause shortfall (D-35)', () => {
    const s = R({ expenseLines: [{ lineId: 'line_a', averageMonthly: mu(200_000), cuttable: true }] });
    const check = INST(150_000);
    const ctx = ctxOf(s);
    const a = assessPlan(ctx, check, resolvePlanStrict(check));
    expect(a).toMatchObject({ state: 'adjust', left: -25_000, remainingShortfall: 0 });
    const o = buildOptions(ctx, check, a);
    expect(pick(o, 'earn_more').gap).toBe(25_000);
    expect(pick(o, 'cut_line').gap).toBe(25_000);
  });

  it('do_without keeps the monthly and projects it at 0% over the plan term', () => {
    const o = pick(optionsOf(BL(), BIG_LOAN), 'do_without');
    expect(o).toMatchObject({ code: 'do_without', keptMonthly: 191_667, horizonMonths: 12, projected: 191_667 * 12 });
    expect(o.projectionReturn).toBe(ZERO_PERCENT);
  });

  it('do_without falls back to 60 months and never keeps a negative monthly', () => {
    const o = pick(optionsOf(BL(), buyCash(1_700_000, { runningCostsNet: mu(-100_000) })), 'do_without');
    expect(o.keptMonthly).toBe(0);
    expect(o.horizonMonths).toBe(60);
    expect(o.projected).toBe(0);
  });

  it('do_without.byRate has 0% first and one entry per entered rate (D-51)', () => {
    const none = pick(optionsOf(BL(), BIG_LOAN), 'do_without');
    expect(none.byRate).toEqual([
      { rate: ZERO_PERCENT, contributed: 191_667 * 12, projected: 191_667 * 12, growth: 0, rangeCode: null },
    ]);
    const s = BL({ projectionRates: [percent('5'), percent('7')], projectionReturn: percent('5') });
    const o = pick(optionsOf(s, BIG_LOAN), 'do_without');
    expect(o.byRate.map((r) => r.rate)).toEqual([ZERO_PERCENT, percent('5'), percent('7')]);
    for (const r of o.byRate) {
      expect(r.contributed).toBe(191_667 * 12);
      expect(r.projected).toBe(futureValue(mu(191_667), r.rate, 12, mu(0)));
      expect(r.growth).toBe(r.projected! - r.contributed);
    }
    expect(o.projected).toBe(o.byRate[1]!.projected);
    expect(o.projectionReturn).toBe(percent('5'));
  });

  it('invest checks get cut, earn, save and do-without only', () => {
    const o = optionsOf(R({ expenseLines: LINES }), investMonthly(700_000, 12));
    expect(codes(o)).toEqual(['cut_line', 'cut_line', 'earn_more', 'do_without']);
  });
});
