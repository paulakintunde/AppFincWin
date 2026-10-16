import { divideHalfUp } from '../../money/rounding';
import { minorUnits } from '../../money/types';
import { futureValue } from '../../payoff/futureValue';
import { ZERO_PERCENT, percent } from '../../payoff/types';
import { buildAlternatives } from '../alternatives';
import { assessPlan, prepareContext } from '../assess';
import { resolvePlanStrict } from '../plan';
import { myPart } from '../share';
import type {
  AlternativeRow,
  AssessContext,
  Alternatives,
  BuyCheck,
  CardMinimumTerms,
  CardRecord,
  DebtRecord,
  DecideLimits,
  DecideSnapshot,
  InvestCheck,
  PurchaseCheck,
} from '../types';
import { USD, bill, buyCash, fullMonth, income, monthsOf, snapshotOf } from './helpers/fixtures';

const mu = minorUnits;

// ── the 04-07 fixture set ──
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
const PAY = income({
  seriesId: 'pay',
  freq: 'monthly',
  anchorDate: '2026-01-25',
  lastPaidDate: '2026-06-25',
  latestAmount: 600_000,
});
const YEARLY_500 = bill({
  seriesId: 's-ins',
  freq: 'yearly',
  anchorDate: '2025-09-01',
  lastPaidDate: '2025-09-01',
  latestAmount: 500_000,
});
// case B: cash 3_000_000, reserve 600_000, leftBefore 125_000 (all spare)
const B = (over: Partial<DecideSnapshot> = {}): DecideSnapshot => BL({ cashOnHand: mu(3_000_000), ...over });
const LOAN = (price: number, deposit: number, termMonths: number | null, apr = percent('9.4')): BuyCheck =>
  buyCash(price, { payment: { method: 'loan', deposit: mu(deposit), termMonths, apr } });
const LOAN_B = LOAN(1_450_000, 300_000, 48);
const TERMS: CardMinimumTerms = { minimumPercent: percent('1'), interestAdded: true, floor: mu(2_500) };
const CARD: CardRecord = { id: 'c1', apr: percent('22.9'), minimumTerms: TERMS, currency: USD };
const CODES = ['as_planned', 'cheaper', 'wait_and_save', 'skip'];

function ctxOf(s: DecideSnapshot): AssessContext {
  const r = prepareContext(s);
  if (!r.ok) throw new Error(`expected ok, got ${r.reasons.join(',')}`);
  return r.context;
}
function altsOf(s: DecideSnapshot, check: PurchaseCheck, ratio?: number): Alternatives {
  const ctx = ctxOf(s);
  const a = buildAlternatives(ctx, check, assessPlan(ctx, check, resolvePlanStrict(check)), ratio);
  expect(a.rows.map((r) => r.code)).toEqual(CODES);
  return a;
}
const rowOf = (a: Alternatives, code: AlternativeRow['code']): AlternativeRow =>
  a.rows.find((r) => r.code === code) as AlternativeRow;

describe('buildAlternatives worked case B: everything spare (DEC-14)', () => {
  const ctx = ctxOf(B());
  const plan = resolvePlanStrict(LOAN_B);
  const assessment = assessPlan(ctx, LOAN_B, plan);
  const a = buildAlternatives(ctx, LOAN_B, assessment);

  it('has the four rows in order and no suppression', () => {
    expect(a.rows.map((r) => r.code)).toEqual(['as_planned', 'cheaper', 'wait_and_save', 'skip']);
    expect(a.rows.every((r) => r.suppression === null)).toBe(true);
    expect(a.horizonMonths).toBe(48);
    expect(a.cheaperPrice).toBe(942_500);
    expect(a.spareCash).toBe(2_400_000);
    expect(a.spareMonthly).toBe(125_000);
    expect(a.projectionReturn).toBe(ZERO_PERCENT);
  });

  it('as planned shows my day-one and monthly with no projection', () => {
    const r = rowOf(a, 'as_planned');
    expect(r).toEqual({
      code: 'as_planned',
      dayOne: assessment.mineDayOne,
      monthly: assessment.mineMonthly,
      contributed: null,
      projected: null,
      growth: null,
      byRate: null,
      suppression: null,
    });
  });

  it('projects at 0% when no return is entered: projected === contributed, growth 0 (D-06)', () => {
    for (const code of ['cheaper', 'wait_and_save', 'skip'] as const) {
      const r = rowOf(a, code);
      expect(r.projected).toBe(r.contributed);
      expect(r.growth).toBe(0);
      expect(r.byRate).toHaveLength(1);
    }
  });

  it('cheaper row: my share of the cheaper plan, kept parts and the contribution', () => {
    const cheapCheck = LOAN(942_500, 195_000, 48);
    const cheapPlan = resolvePlanStrict(cheapCheck);
    const cheapAssessment = assessPlan(ctx, cheapCheck, cheapPlan);
    const dayDiff = assessment.mineDayOne - myPart(cheapPlan.dayOne, ctx.purchaseShare);
    const moDiff = assessment.mineMonthly - myPart(cheapPlan.monthly, ctx.purchaseShare);
    expect(dayDiff).toBe(105_000);
    const r = rowOf(a, 'cheaper');
    expect(r.dayOne).toBe(195_000);
    expect(r.monthly).toBe(cheapPlan.monthly);
    expect(a.cheaper).toEqual({
      ratioPercent: 65,
      notSpent: 507_500,
      dayDiff,
      monthlyDiff: moDiff,
      keptOnDay: dayDiff,
      keptMonthly: moDiff,
      leftAfter: cheapAssessment.left,
      monthlyPayment: cheapPlan.monthly,
    });
    expect(r.contributed).toBe(dayDiff + moDiff * 48);
  });

  it('wait and save: buys outright next month, then invests the payment for the rest of the horizon', () => {
    expect(a.monthsToBuy).toBe(1);
    expect(a.waitMonths).toBe(47);
    const r = rowOf(a, 'wait_and_save');
    const investC = Math.min(assessment.newMonthly, 125_000);
    expect(r.dayOne).toBe(1_450_000);
    expect(r.monthly).toBe(investC);
    expect(r.contributed).toBe(investC * 47);
  });

  it('skip: invests the day-one money and the monthly payment', () => {
    const r = rowOf(a, 'skip');
    const monthly = Math.min(assessment.newMonthly, 125_000);
    expect(r.dayOne).toBeNull();
    expect(r.monthly).toBe(monthly);
    expect(r.contributed).toBe(assessment.mineDayOne + monthly * 48);
  });

  it('ratio 100 leaves nothing unspent and nothing freed', () => {
    const full = altsOf(B(), LOAN_B, 100);
    expect(full.cheaper.notSpent).toBe(0);
    expect(full.cheaper.dayDiff).toBe(0);
    expect(full.cheaper.monthlyDiff).toBe(0);
    expect(rowOf(full, 'cheaper').suppression).toEqual({ code: 'nothing_freed', amount: null });
  });

  it('rejects a ratio outside the integers 1..100', () => {
    for (const bad of [0, 101, 65.5, -1]) {
      expect(() => altsOf(B(), LOAN_B, bad)).toThrow(/^buildAlternatives: /);
    }
  });
});

describe('horizon (n = clamp(plan months or 36, 12, 120))', () => {
  it('loan 48 months → 48; cash → 36', () => {
    expect(altsOf(B(), LOAN_B).horizonMonths).toBe(48);
    expect(altsOf(B(), buyCash(1_450_000)).horizonMonths).toBe(36);
  });

  it('card over 6 months → 12; card minimum (600 months) → 120', () => {
    const card = (payoff: Extract<BuyCheck['payment'], { method: 'card' }>['payoff']): BuyCheck =>
      buyCash(1_450_000, { payment: { method: 'card', card: CARD, payoff, dealerCap: null } });
    expect(altsOf(B(), card({ kind: 'months', months: 6 })).horizonMonths).toBe(12);
    expect(altsOf(B(), card({ kind: 'minimum' })).horizonMonths).toBe(120);
  });
});

describe('worked case A: nothing spare (the ethical rule)', () => {
  const sA = BL({ months: [1, 2, 3].map((i) => fullMonth(`2026-0${3 + i}`, 600_000, 445_000)) });

  it('suppresses wait and skip with the shortfall and shows no figure', () => {
    expect(ctxOf(sA).leftBefore).toBe(-20_000);
    const a = altsOf(sA, buyCash(100_000));
    expect(rowOf(a, 'wait_and_save')).toMatchObject({
      contributed: null,
      projected: null,
      growth: null,
      byRate: null,
      monthly: null,
      suppression: { code: 'month_short', amount: 20_000 },
    });
    expect(rowOf(a, 'skip')).toMatchObject({
      contributed: null,
      projected: null,
      growth: null,
      byRate: null,
      suppression: { code: 'month_short', amount: 20_000 },
    });
    expect(rowOf(a, 'cheaper').suppression).toEqual({ code: 'month_short', amount: 20_000 });
    expect(a.monthsToBuy).toBeNull();
    expect(a.waitMonths).toBe(0);
    expect(a.spareMonthly).toBe(0);
  });
});

describe('other suppressions', () => {
  const cashAtReserve = (over: Partial<DecideSnapshot> = {}) => BL({ cashOnHand: mu(600_000), ...over });

  it('nothing_freed / nothing_spare when no money is genuinely spare', () => {
    const a = altsOf(cashAtReserve(), buyCash(1_000_000));
    expect(a.spareCash).toBe(0);
    expect(rowOf(a, 'cheaper').suppression).toEqual({ code: 'nothing_freed', amount: null });
    expect(rowOf(a, 'skip').suppression).toEqual({ code: 'nothing_spare', amount: null });
  });

  it('too_thin: the month left after the cheaper one is under the user spare floor (D-05)', () => {
    const s = cashAtReserve({
      months: monthsOf([[600_000, 424_000], [600_000, 424_000], [600_000, 424_000]]),
      limits: { ...LIMITS_BL, spareFloor: mu(2_500) },
    });
    const ctx = ctxOf(s);
    expect(ctx.leftBefore).toBe(1_000);
    const a = altsOf(s, buyCash(1_000_000));
    expect(rowOf(a, 'cheaper').suppression).toEqual({ code: 'too_thin', amount: 1_000 });
    expect(a.cheaper.keptMonthly).toBe(0);
  });

  it('a small left over with the default 0 floor is not too thin', () => {
    const s = cashAtReserve({ months: monthsOf([[600_000, 424_000], [600_000, 424_000], [600_000, 424_000]]) });
    const a = altsOf(s, buyCash(1_000_000));
    expect(rowOf(a, 'cheaper').suppression).toEqual({ code: 'nothing_freed', amount: null });
  });

  it('past_horizon: the monthly surplus would take longer than the horizon to buy outright', () => {
    const s = BL({ months: monthsOf([[600_000, 420_000], [600_000, 420_000], [600_000, 420_000]]) });
    const a = altsOf(s, buyCash(1_700_000));
    expect(a.spareMonthly).toBe(5_000);
    expect(a.monthsToBuy).toBe(60);
    const r = rowOf(a, 'wait_and_save');
    expect(r.suppression).toEqual({ code: 'past_horizon', amount: null });
    expect(r.dayOne).toBeNull();
    expect(r.monthly).toBe(5_000);
    expect(r.projected).toBeNull();
  });

  it('wait_and_save is available exactly at the horizon edge', () => {
    // spare 1_400_000; need 300_000; surplus 8_333 → ceil = 37 > 36, surplus 8_334 → 36
    const at = (spend: number) =>
      altsOf(BL({ months: monthsOf([[600_000, spend], [600_000, spend], [600_000, spend]]) }), buyCash(1_700_000));
    expect(rowOf(at(416_666), 'wait_and_save').suppression).toBeNull();
    expect(at(416_666).monthsToBuy).toBe(36);
    expect(at(416_667).monthsToBuy).toBe(37);
    expect(rowOf(at(416_667), 'wait_and_save').suppression).toEqual({ code: 'past_horizon', amount: null });
  });
});

describe('spare cash is capped at what exists (D-24, D-19)', () => {
  it('a bill due within 90 days lowers spareCash by its amount', () => {
    const base = altsOf(B(), buyCash(100_000));
    const withBill = altsOf(B({ bills: [YEARLY_500] }), buyCash(100_000));
    expect(base.spareCash - withBill.spareCash).toBe(500_000);
  });

  it('still deducts the bill when a confirmed pay series exists (checker resolution 2026-10-15)', () => {
    const base = altsOf(B(), buyCash(100_000));
    const withPay = altsOf(B({ incomeSeries: [PAY], bills: [YEARLY_500] }), buyCash(100_000));
    expect(base.spareCash - withPay.spareCash).toBe(500_000);
    const ctx = ctxOf(B({ incomeSeries: [PAY], bills: [YEARLY_500] }));
    const asm = assessPlan(ctx, buyCash(100_000), resolvePlanStrict(buyCash(100_000)));
    expect(asm.cashAfter).toBeGreaterThan(asm.cashAfterBillsAndPurchase);
  });

  it('spare cash is zero when cash is under the cushion', () => {
    expect(altsOf(BL({ cashOnHand: mu(100_000) }), buyCash(50_000)).spareCash).toBe(0);
  });
});

describe('purchase share (D-34)', () => {
  it('uses my part of the price in the wait target and my part of day-one', () => {
    const solo = altsOf(BL(), buyCash(2_400_000));
    const shared = altsOf(
      BL({
        scope: { kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'even' } },
        householdSpending: { rule: { kind: 'even' }, byCategory: [] },
      }),
      buyCash(2_400_000)
    );
    expect(rowOf(solo, 'as_planned').dayOne).toBe(2_400_000);
    expect(rowOf(shared, 'as_planned').dayOne).toBe(1_200_000);
    expect(shared.monthsToBuy).toBeLessThan(solo.monthsToBuy as number);
  });
});

describe('rates (D-51)', () => {
  it('returns a byRate list at 0% and at the entered rate', () => {
    const s = B({ projectionRates: [percent('5')] });
    const ctx = ctxOf(s);
    const a = altsOf(s, LOAN_B);
    expect(a.rates).toEqual(ctx.limits.projectionRates);
    expect(a.rates.map((r) => r.rate)).toEqual([ZERO_PERCENT, percent('5')]);
    const asm = assessPlan(ctx, LOAN_B, resolvePlanStrict(LOAN_B));
    const five = percent('5');
    const investC = Math.min(asm.newMonthly, 125_000);
    const expected = {
      cheaper: [a.cheaper.keptMonthly, 48, a.cheaper.keptOnDay],
      wait_and_save: [investC, 47, 0],
      skip: [Math.min(asm.newMonthly, 125_000), 48, asm.mineDayOne],
    } as const;
    for (const code of ['cheaper', 'wait_and_save', 'skip'] as const) {
      const r = rowOf(a, code);
      const [monthly, months, seed] = expected[code];
      expect(r.byRate).toHaveLength(2);
      expect(r.byRate![0]!.rate).toBe(ZERO_PERCENT);
      expect(r.byRate![0]!.projected).toBe(r.byRate![0]!.contributed);
      expect(r.byRate![0]!.growth).toBe(0);
      expect(r.byRate![1]!).toEqual({
        rate: five,
        contributed: seed + monthly * months,
        projected: futureValue(mu(monthly), five, months, mu(seed)),
        growth: futureValue(mu(monthly), five, months, mu(seed)) - (seed + monthly * months),
      });
      expect(r.projected).toBe(r.byRate![0]!.projected); // projectionReturn null
    }
    expect(rowOf(a, 'as_planned').byRate).toBeNull();
  });

  it('the single projected figure follows projectionReturn while byRate keeps every rate', () => {
    const s = B({ projectionReturn: percent('6.5'), projectionRates: [percent('6.5')] });
    const a = altsOf(s, LOAN_B);
    const r = rowOf(a, 'skip');
    expect(a.projectionReturn).toBe(percent('6.5'));
    expect(r.projected).toBe(r.byRate![1]!.projected);
    expect(r.projected as number).toBeGreaterThan(r.contributed as number);
    expect(r.growth).toBe((r.projected as number) - (r.contributed as number));
  });

  it('a suppressed row has no byRate', () => {
    const a = altsOf(BL({ cashOnHand: mu(600_000), projectionRates: [percent('5')] }), buyCash(1_000_000));
    expect(rowOf(a, 'skip').byRate).toBeNull();
  });
});

describe('invest checks', () => {
  it('a monthly invest check is priced by its amount', () => {
    const check: InvestCheck = {
      kind: 'invest',
      currency: USD,
      amount: mu(50_000),
      payment: { method: 'monthly', termMonths: 24 },
    };
    const a = altsOf(B(), check);
    expect(a.horizonMonths).toBe(24);
    expect(a.cheaperPrice).toBe(divideHalfUp(50_000n * 65n, 100n));
  });
});
