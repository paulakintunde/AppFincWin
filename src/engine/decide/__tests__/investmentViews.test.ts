import { minorUnits } from '../../money/types';
import { futureValue } from '../../payoff/futureValue';
import { futureValueNet, futureValuePath } from '../../payoff/futureValuePath';
import { amortiseSchedule, simulateMinimumSchedule } from '../../payoff/rateSchedule';
import {
  ONE_HUNDRED_PERCENT,
  ZERO_PERCENT,
  percent,
  percentFromScaled,
  type CardMinimumTerms,
  type Percent,
} from '../../payoff/types';
import { buildAlternatives } from '../alternatives';
import { assessPlan, prepareContext } from '../assess';
import { DEFAULT_PROJECTION_HORIZON_MONTHS } from '../constants';
import { investmentViews } from '../investmentViews';
import { rateScheduleFor, resolvePlanStrict } from '../plan';
import { myPart } from '../share';
import type {
  Assessment,
  AssessContext,
  BuyCheck,
  CardRecord,
  DecideSnapshot,
  InvestmentViews,
  InvestmentViewsInput,
  RateFigure,
} from '../types';
import { bill, buyCash, income, monthsOf, snapshotOf, USD } from './helpers/fixtures';

const mu = minorUnits;
const pct = percent;

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
    investmentBalance: mu(500_000),
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
const INST = (a: number, over: Partial<BuyCheck> = {}): BuyCheck =>
  buyCash(12 * a, { payment: { method: 'instalment', instalmentAmount: mu(a), instalmentCount: 12 }, ...over });
const loan = (over: Partial<BuyCheck> = {}): BuyCheck =>
  buyCash(1_450_000, {
    payment: { method: 'loan', deposit: mu(300_000), termMonths: 48, apr: pct('9.4') },
    ...over,
  });
const TERMS: CardMinimumTerms = { minimumPercent: pct('1'), interestAdded: true, floor: mu(2_500) };
const CARD: CardRecord = { id: 'c1', apr: pct('22.9'), minimumTerms: TERMS, currency: USD };
const cardCheck = (
  payoff: Extract<BuyCheck['payment'], { method: 'card' }>['payoff'],
  card: CardRecord = CARD,
  price = 300_000
): BuyCheck => buyCash(price, { payment: { method: 'card', card, payoff, dealerCap: null } });

const NONE: InvestmentViewsInput = { horizonMonths: null, holdingFee: null };

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error('expected ok');
  return r.context;
}
function run(
  s: DecideSnapshot,
  check: BuyCheck,
  input: InvestmentViewsInput = NONE
): { views: InvestmentViews; a: Assessment; ctx: AssessContext } {
  const ctx = ctxOf(s);
  const a = assessPlan(ctx, check, resolvePlanStrict(check));
  return { views: investmentViews(ctx, check, a, input), a, ctx };
}
const at = (figures: readonly RateFigure[], rate: Percent): RateFigure => figures.find((f) => f.rate === rate)!;
const ratesOf = (views: InvestmentViews): Percent[] => views.rates.map((r) => r.rate);

describe('rates (D-51)', () => {
  it('no entered rate gives 0% held, not grown', () => {
    expect(run(BL(), buyCash(1_000)).views.rates).toEqual([
      { rate: ZERO_PERCENT, userEntered: false, label: 'held_not_grown' },
    ]);
  });
  it('an entered rate is labelled as a projection', () => {
    const v = run(BL({ projectionRates: [pct('5')] }), buyCash(1_000)).views;
    expect(v.rates).toEqual([
      { rate: ZERO_PERCENT, userEntered: false, label: 'held_not_grown' },
      { rate: pct('5'), userEntered: true, label: 'projection_at_entered_rate' },
    ]);
  });
  it('duplicates are dropped, entry order kept', () => {
    expect(ratesOf(run(BL({ projectionRates: [pct('5'), pct('5'), pct('7')] }), buyCash(1_000)).views)).toEqual([
      ZERO_PERCENT,
      pct('5'),
      pct('7'),
    ]);
  });
  it('a user-entered 0% appears once', () => {
    const v = run(BL({ projectionRates: [ZERO_PERCENT, pct('5')] }), buyCash(1_000)).views;
    expect(v.rates).toEqual([
      { rate: ZERO_PERCENT, userEntered: true, label: 'held_not_grown' },
      { rate: pct('5'), userEntered: true, label: 'projection_at_entered_rate' },
    ]);
  });
  it('four rates fail once, in prepareContext', () => {
    expect(() => prepareContext(BL({ projectionRates: [pct('1'), pct('2'), pct('3'), pct('4')] }))).toThrow(
      /^prepareContext: /
    );
  });
  it('is the same list the alternatives use', () => {
    const s = BL({ projectionRates: [pct('5')] });
    const check = buyCash(2_400_000);
    const { views, a, ctx } = run(s, check);
    expect(buildAlternatives(ctx, check, a).rates).toEqual(views.rates);
    expect(views.rates).toEqual(ctx.limits.projectionRates);
  });
});

describe('horizon (D-52)', () => {
  it('plan term for a loan', () => {
    const v = run(BL(), loan()).views;
    expect(v.horizonMonths).toBe(48);
    expect(v.horizonSource).toBe('plan_term');
  });
  it('60 for cash', () => {
    const v = run(BL(), buyCash(1_000)).views;
    expect(v.horizonMonths).toBe(DEFAULT_PROJECTION_HORIZON_MONTHS);
    expect(v.horizonSource).toBe('cash_default');
  });
  it('the user can set it', () => {
    const v = run(BL(), loan(), { horizonMonths: 24, holdingFee: null }).views;
    expect(v.horizonMonths).toBe(24);
    expect(v.horizonSource).toBe('user');
  });
  it.each([0, 601, 1.5, -1])('rejects %p', (n) => {
    expect(() => run(BL(), loan(), { horizonMonths: n, holdingFee: null })).toThrow(/^investmentViews: /);
  });
});

describe('(a) price invested instead (D-52)', () => {
  it('a lump over the horizon at 0% and at the entered rate', () => {
    const { views } = run(BL({ projectionRates: [pct('5')] }), buyCash(1_200_000));
    expect(views.priceInvested.lump).toBe(1_200_000);
    expect(views.priceInvested.byRate[0]).toEqual({
      rate: ZERO_PERCENT,
      contributed: 1_200_000,
      projected: 1_200_000,
      growth: 0,
    });
    const p = futureValue(mu(0), pct('5'), 60, mu(1_200_000));
    expect(views.priceInvested.byRate[1]).toEqual({
      rate: pct('5'),
      contributed: 1_200_000,
      projected: p,
      growth: p - 1_200_000,
    });
  });
  it('is my share of the price in a household', () => {
    const s = BL({
      scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } },
      householdSpending: { rule: { kind: 'even' }, byCategory: [] },
    });
    expect(run(s, buyCash(1_200_000)).views.priceInvested.lump).toBe(600_000);
  });
  it('D-63: a 1% holding fee takes the 5% line to 4%, and shrinks the 0% line', () => {
    const { views } = run(BL({ projectionRates: [pct('5')] }), buyCash(1_200_000), {
      horizonMonths: null,
      holdingFee: pct('1'),
    });
    expect(at(views.priceInvested.byRate, pct('5'))).toEqual({
      rate: pct('5'),
      contributed: 1_200_000,
      projected: 1_465_196,
      growth: 265_196,
    });
    expect(1_465_196).toBe(futureValue(mu(0), pct('4'), 60, mu(1_200_000)));
    const zero = at(views.priceInvested.byRate, ZERO_PERCENT);
    expect(zero.projected).toBe(futureValueNet(mu(0), ZERO_PERCENT, 60, mu(1_200_000), pct('1')));
    expect(zero.projected).toBeLessThan(1_200_000);
    expect(zero.growth).toBeLessThan(0);
    expect(views.holdingFee).toBe(pct('1'));
    expect(views.netRates).toEqual([
      { rate: 0n, netRateScaled: -pct('1') },
      { rate: pct('5'), netRateScaled: pct('4') },
    ]);
  });
  it('no fee: figures equal a zero fee, and netRates equal the rates', () => {
    const s = BL({ projectionRates: [pct('5')] });
    const none = run(s, loan()).views;
    const zero = run(s, loan(), { horizonMonths: null, holdingFee: ZERO_PERCENT }).views;
    expect(zero).toEqual(none);
    expect(none.holdingFee).toBe(ZERO_PERCENT);
    expect(none.netRates).toEqual(none.rates.map((r) => ({ rate: r.rate, netRateScaled: r.rate })));
  });
});

describe('(b) payments invested instead (D-52)', () => {
  const RUN = 5_500;
  const s = BL({ projectionRates: [pct('5')] });
  const check = loan({ runningCostsNet: mu(RUN) });
  const { views, a } = run(s, check);
  it('describes the payments', () => {
    expect(views.paymentsInvested.firstMonthPayment).toBe(a.plan.paymentSteps[0]!.amount);
    expect(views.paymentsInvested.paymentMonths).toBe(48);
    expect(views.paymentsInvested.monthlyRunning).toBe(RUN);
  });
  it('0%: contributed equals projected equals payments plus running costs', () => {
    const sum = a.plan.paymentSteps.reduce((t, st) => t + st.amount * (st.toMonth - st.fromMonth + 1), 0);
    const zero = views.paymentsInvested.byRate[0]!;
    expect(zero.contributed).toBe(sum + RUN * 48);
    expect(zero.projected).toBe(zero.contributed);
    expect(zero.growth).toBe(0);
  });
  it('5%: one rounding per step, grown to the horizon, plus running costs', () => {
    let expected: number = futureValue(mu(RUN), pct('5'), 48, mu(0));
    for (const st of a.plan.paymentSteps) {
      const len = st.toMonth - st.fromMonth + 1;
      expected += futureValue(mu(0), pct('5'), 48 - st.toMonth, futureValue(st.amount, pct('5'), len, mu(0)));
    }
    const five = views.paymentsInvested.byRate[1]!;
    expect(five.projected).toBe(expected);
    expect(five.growth).toBe(five.projected - five.contributed);
  });
  it('D-63: a 1% fee at 5% is the same sum at 4%', () => {
    const fee = run(s, check, { horizonMonths: null, holdingFee: pct('1') }).views;
    let expected: number = futureValue(mu(RUN), pct('4'), 48, mu(0));
    for (const st of a.plan.paymentSteps) {
      const len = st.toMonth - st.fromMonth + 1;
      expected += futureValue(mu(0), pct('4'), 48 - st.toMonth, futureValue(st.amount, pct('4'), len, mu(0)));
    }
    expect(fee.paymentsInvested.byRate[1]!.projected).toBe(expected);
  });
  it('a cash purchase has no payment months, only running costs', () => {
    const v = run(BL(), buyCash(500_000, { runningCostsNet: mu(RUN) })).views;
    expect(v.paymentsInvested.paymentMonths).toBe(0);
    expect(v.paymentsInvested.firstMonthPayment).toBe(0);
    expect(v.paymentsInvested.byRate[0]!.contributed).toBe(RUN * 60);
  });
  it('negative running costs contribute 0', () => {
    const v = run(BL(), buyCash(500_000, { runningCostsNet: mu(-3_000) })).views;
    expect(v.paymentsInvested.monthlyRunning).toBe(0);
    expect(v.paymentsInvested.byRate[0]!.contributed).toBe(0);
  });
  it('payments beyond a shorter horizon are not counted; a step starting after it is skipped', () => {
    const v = run(BL(), loan(), { horizonMonths: 10, holdingFee: null }).views;
    expect(v.paymentsInvested.byRate[0]!.contributed).toBe(10 * a.plan.paymentSteps[0]!.amount);
    expect(v.paymentsInvested.paymentMonths).toBe(48);
  });
});

describe('(c) impact on current investing (D-35, D-52)', () => {
  it('nothing paused gives null', () => {
    expect(run(BL(), buyCash(300_000)).views.pauseImpact).toBeNull();
  });
  it('the paused amount and the growth not earned', () => {
    const { views, a } = run(R({ projectionRates: [pct('5')] }), INST(150_000), {
      horizonMonths: 12,
      holdingFee: null,
    });
    expect(a.investingAtRisk).toBe(25_000);
    expect(views.pauseImpact!.pausedMonthly).toBe(25_000);
    expect(views.pauseImpact!.byRate[0]).toEqual({
      rate: ZERO_PERCENT,
      contributed: 300_000,
      projected: 300_000,
      growth: 0,
    });
    expect(views.pauseImpact!.byRate[1]!.projected).toBe(futureValue(mu(25_000), pct('5'), 12, mu(0)));
  });
  it('D-63: a 0.5% fee on the 0% line', () => {
    const { views } = run(R(), INST(150_000), { horizonMonths: 12, holdingFee: pct('0.5') });
    expect(views.pauseImpact!.byRate[0]).toEqual({
      rate: ZERO_PERCENT,
      contributed: 300_000,
      projected: 299_313,
      growth: -687,
    });
  });
});

describe('(d) net-worth path (D-52)', () => {
  const H12: InvestmentViewsInput = { horizonMonths: 12, holdingFee: null };
  it('cash purchase at 0%', () => {
    const { views } = run(BL(), buyCash(300_000), H12);
    const nw = views.netWorth[0]!;
    expect(nw.rate).toBe(ZERO_PERCENT);
    expect(nw.withoutPurchase).toHaveLength(13);
    expect(nw.withPurchase).toHaveLength(13);
    for (let i = 0; i <= 12; i += 1) {
      expect(nw.withoutPurchase[i]).toBe(2_000_000 + i * (125_000 + 25_000) + (500_000 + 40_000 * i) - 15_800_000);
      expect(nw.withPurchase[i]).toBe(nw.withoutPurchase[i]! - 300_000);
    }
  });
  it('at 5% the investments term is the future value path', () => {
    const { views } = run(BL({ projectionRates: [pct('5')] }), buyCash(300_000), H12);
    const path = futureValuePath(mu(40_000), pct('5'), 12, mu(500_000), ZERO_PERCENT);
    const nw = views.netWorth[1]!;
    for (let i = 0; i <= 12; i += 1) {
      expect(nw.withoutPurchase[i]).toBe(2_000_000 + i * 150_000 + path[i]! - 15_800_000);
      expect(nw.withPurchase[i]).toBe(nw.withoutPurchase[i]! - 300_000);
    }
  });
  it('D-63: the investments term is net of the fee in both paths', () => {
    const { views } = run(BL(), buyCash(300_000), { horizonMonths: 12, holdingFee: pct('1') });
    const path = futureValuePath(mu(40_000), ZERO_PERCENT, 12, mu(500_000), pct('1'));
    expect(path[12]).toBe(972_829);
    const nw = views.netWorth[0]!;
    expect(nw.withoutPurchase[12]).toBe(2_000_000 + 12 * 150_000 + 972_829 - 15_800_000);
    expect(nw.withPurchase[12]).toBe(nw.withoutPurchase[12]! - 300_000);
  });
  it('a loan carries the remaining balance as debt', () => {
    const RUN = 5_500;
    const check = loan({ runningCostsNet: mu(RUN) });
    const { views, a } = run(BL(), check, { horizonMonths: 60, holdingFee: null });
    const sched = amortiseSchedule(a.plan.financed, rateScheduleFor(pct('9.4'), undefined), 48);
    const pay = (k: number): number => a.plan.paymentSteps.find((st) => st.fromMonth <= k && k <= st.toMonth)?.amount ?? 0;
    const nw = views.netWorth[0]!;
    let paid = 0;
    for (let i = 0; i <= 60; i += 1) {
      if (i > 0) paid += pay(i);
      const remaining = i === 0 ? a.plan.financed : sched.balancesByMonth[Math.min(i, 48) - 1]!;
      expect(nw.withPurchase[i]).toBe(nw.withoutPurchase[i]! - 300_000 - paid - RUN * i - remaining);
    }
  });
  it('a pause invests what is left and keeps the paused amount as cash', () => {
    const { views, a, ctx } = run(R(), INST(150_000), H12);
    const nw = views.netWorth[0]!;
    expect(a.investingAfter).toBe(15_000);
    for (let i = 0; i <= 12; i += 1) {
      let cash = ctx.cashAfterBills - 150_000;
      for (let k = 1; k <= i; k += 1) {
        cash += ctx.leftBefore + 25_000 + a.investingAtRisk - (k <= 11 ? 150_000 : 0);
      }
      const owed = (11 - Math.min(i, 11)) * 150_000;
      expect(nw.withPurchase[i]).toBe(cash + (500_000 + 15_000 * i) - ctx.debtBalance - owed);
    }
  });
  it('a card paid in full leaves no balance; a card over months follows its schedule', () => {
    const full = run(BL(), cardCheck({ kind: 'full' }), H12).views.netWorth[0]!;
    for (let i = 0; i <= 12; i += 1) {
      expect(full.withPurchase[i]).toBe(full.withoutPurchase[i]! - 300_000);
    }
    const { views, a } = run(BL(), cardCheck({ kind: 'months', months: 6 }), H12);
    const sched = amortiseSchedule(mu(300_000), rateScheduleFor(CARD.apr!, undefined), 6);
    const nw = views.netWorth[0]!;
    let paid = 0;
    for (let i = 0; i <= 12; i += 1) {
      if (i > 0) paid += a.plan.paymentSteps.find((st) => st.fromMonth <= i && i <= st.toMonth)?.amount ?? 0;
      const remaining = i === 0 ? 300_000 : sched.balancesByMonth[Math.min(i, 6) - 1]!;
      expect(nw.withPurchase[i]).toBe(nw.withoutPurchase[i]! - a.mineDayOne - paid - remaining);
    }
  });
  it('a card paid by the minimum holds the last balance after the schedule ends, or while it never clears', () => {
    for (const interestAdded of [true, false]) {
      const card: CardRecord = { ...CARD, minimumTerms: { ...TERMS, interestAdded } };
      const check = cardCheck({ kind: 'minimum' }, card, 500_000);
      const { views, a } = run(BL(), check, { horizonMonths: 600, holdingFee: null });
      const sched = simulateMinimumSchedule(mu(500_000), rateScheduleFor(card.apr!, undefined), card.minimumTerms!);
      expect(sched.outcome).toBe(interestAdded ? 'cleared' : 'never_clears');
      const nw = views.netWorth[0]!;
      let paid = 0;
      for (const i of [0, 1, 2, 100, 600]) {
        paid = 0;
        for (let k = 1; k <= i; k += 1) {
          paid += a.plan.paymentSteps.find((st) => st.fromMonth <= k && k <= st.toMonth)?.amount ?? 0;
        }
        const remaining = i === 0 ? 500_000 : sched.balancesByMonth[Math.min(i, sched.balancesByMonth.length) - 1]!;
        expect(nw.withPurchase[i]).toBe(nw.withoutPurchase[i]! - a.mineDayOne - paid - remaining);
      }
    }
  });
  it('PAY + a bill due: the start cash is cash after bills even with a cash path', () => {
    const { views, ctx } = run(BL({ incomeSeries: [PAY], bills: [YEARLY_DUE] }), buyCash(300_000), H12);
    expect(ctx.cashAvailable).toBe(2_000_000);
    expect(views.netWorth[0]!.withoutPurchase[0]).toBe(1_880_000 + 500_000 - 15_800_000);
  });
});

describe('D-63 guards and scope', () => {
  it('rejects a holding fee above 100% and below 0', () => {
    expect(() =>
      run(BL(), buyCash(1_000), { horizonMonths: null, holdingFee: percentFromScaled(ONE_HUNDRED_PERCENT + 1n) })
    ).toThrow(/^investmentViews: /);
    expect(() => run(BL(), buyCash(1_000), { horizonMonths: null, holdingFee: -1n as Percent })).toThrow(
      /^investmentViews: /
    );
  });
  it('the alternatives byRate is unchanged by the fee', () => {
    const s = BL({ projectionRates: [pct('5')] });
    const check = loan();
    const ctx = ctxOf(s);
    const a = assessPlan(ctx, check, resolvePlanStrict(check));
    const before = buildAlternatives(ctx, check, a);
    investmentViews(ctx, check, a, { horizonMonths: null, holdingFee: pct('2') });
    expect(buildAlternatives(ctx, check, a)).toEqual(before);
  });
  it('myPart is applied to payments in a household', () => {
    const s = BL({
      scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } },
      householdSpending: { rule: { kind: 'even' }, byCategory: [] },
    });
    const { views, a, ctx } = run(s, loan());
    expect(views.paymentsInvested.firstMonthPayment).toBe(myPart(a.plan.paymentSteps[0]!.amount, ctx.purchaseShare));
  });
});

