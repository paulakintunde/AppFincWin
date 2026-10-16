import fc from 'fast-check';
import { divideHalfUp } from '../../money/rounding';
import { currencyCode, minorUnits } from '../../money/types';
import {
  ONE_HUNDRED_PERCENT,
  SIMULATION_MONTH_CAP,
  ZERO_PERCENT,
  amortise,
  percent,
  percentFromScaled,
  amortiseSchedule,
  simulateMinimum,
  simulateMinimumSchedule,
  singleRate,
  type CardMinimumTerms,
} from '../../payoff';
import type { ItemType } from '../cardRule';
import { rateScheduleFor, resolvePlan, resolvePlanStrict, withPrice } from '../plan';
import type {
  BuyCheck,
  BuyPayment,
  CardRecord,
  InvestCheck,
  Plan,
  PlanResult,
  PromoTerms,
  PurchaseCheck,
} from '../types';
import { USD } from './helpers/fixtures';

const m = minorUnits;
const pct = percent;

const TERMS: CardMinimumTerms = { minimumPercent: pct('1'), interestAdded: true, floor: m(2_500) };
const CARD: CardRecord = { id: 'c1', apr: pct('22.9'), minimumTerms: TERMS, currency: USD };

function buy(payment: BuyPayment, over: Partial<BuyCheck> = {}): BuyCheck {
  return {
    kind: 'buy',
    currency: USD,
    price: m(1_450_000),
    dayFees: m(0),
    itemType: 'general',
    runningCostsNet: m(0),
    payment,
    ...over,
  };
}

function card(
  payoff: Extract<BuyPayment, { method: 'card' }>['payoff'],
  over: Partial<Extract<BuyPayment, { method: 'card' }>> = {},
  check: Partial<BuyCheck> = {}
): BuyCheck {
  return buy({ method: 'card', card: CARD, payoff, dealerCap: null, ...over }, check);
}

function loan(over: Partial<Extract<BuyPayment, { method: 'loan' }>> = {}, check: Partial<BuyCheck> = {}): BuyCheck {
  return buy({ method: 'loan', deposit: m(300_000), termMonths: 48, apr: pct('9.4'), ...over }, check);
}

function resolved(check: PurchaseCheck): Plan {
  const r = resolvePlan(check);
  if (r.status !== 'resolved') throw new Error(`expected resolved, got ${r.reasons.join(',')}`);
  return r.plan;
}

function reasonsOf(check: PurchaseCheck): readonly string[] {
  const r: PlanResult = resolvePlan(check);
  if (r.status !== 'missing') throw new Error('expected missing');
  return r.reasons;
}

const sumSteps = (p: Plan): number =>
  p.paymentSteps.reduce((s, st) => s + st.amount * (st.toMonth - st.fromMonth + 1), 0);

describe('resolvePlan: cash', () => {
  it('pays the whole price on the day', () => {
    const p = resolved(buy({ method: 'cash' }));
    expect(p).toMatchObject({
      dayOne: 1_450_000,
      monthly: 0,
      months: 0,
      financed: 0,
      total: 1_450_000,
      interest: 0,
      card: null,
      finalMonthly: null,
      impliedAnnualRate: null,
      paymentSteps: [],
      promo: null,
      lateFees: null,
    });
  });
});

describe('resolvePlan: loan', () => {
  it('amortises the financed balance (deposit 300_000, 48 months, 9.4%)', () => {
    const p = resolved(loan());
    const am = amortise(m(1_150_000), pct('9.4'), 48);
    expect(p.dayOne).toBe(300_000);
    expect(p.financed).toBe(1_150_000);
    expect(p.monthly).toBe(am.payment);
    expect(p.months).toBe(48);
    expect(p.total).toBe(300_000 + am.totalPaid);
    expect(p.interest).toBe(p.total! - p.price);
    expect(p.finalMonthly).toBe(am.finalPayment);
    expect(p.monthly * 47 + p.finalMonthly!).toBe(am.totalPaid);
    expect(p.paymentSteps).toEqual([
      { fromMonth: 1, toMonth: 47, amount: am.payment },
      { fromMonth: 48, toMonth: 48, amount: am.finalPayment },
    ]);
    expect(p.card).toBeNull();
    expect(p.impliedAnnualRate).toBeNull();
  });

  it('uses one step when the level and final payments are equal', () => {
    const p = resolved(loan({ deposit: m(0), apr: ZERO_PERCENT, termMonths: 10 }, { price: m(1_000_000) }));
    expect(p.paymentSteps).toEqual([{ fromMonth: 1, toMonth: 10, amount: 100_000 }]);
  });

  it('clamps the deposit to price minus the on-the-day fees', () => {
    const p = resolved(loan({}, { dayFees: m(45_000) }));
    expect(p.dayOne).toBe(345_000);
    expect(p.financed).toBe(1_105_000);
    expect(p.dayFees).toBe(45_000);
    const big = resolved(loan({ deposit: m(5_000_000) }, { dayFees: m(45_000) }));
    expect(big.dayOne).toBe(1_450_000);
    expect(big.financed).toBe(0);
  });

  it('a deposit at or above the price leaves nothing financed and no payment steps', () => {
    const p = resolved(loan({ deposit: m(2_000_000) }));
    expect(p.financed).toBe(0);
    expect(p.monthly).toBe(0);
    expect(p.paymentSteps).toEqual([]);
    expect(p.dayOne).toBe(1_450_000);
  });

  it('dayFees larger than the price still floors the deposit and financed amounts at zero', () => {
    const p = resolved(loan({}, { price: m(10_000), dayFees: m(20_000) }));
    expect(p.dayOne).toBe(20_000);
    expect(p.financed).toBe(0);
  });

  it('0% APR is a valid loan with no interest', () => {
    const p = resolved(loan({ apr: ZERO_PERCENT }));
    expect(p.interest).toBe(0);
  });

  it('quick-check Credit (05 D-23): no deposit, 0% APR, fees on the day', () => {
    const p = resolved(
      loan({ deposit: m(0), termMonths: 12, apr: ZERO_PERCENT }, { price: m(1_545_000), dayFees: m(95_000) })
    );
    expect(p.dayOne).toBe(95_000);
    expect(p.financed).toBe(1_450_000);
    expect(p.monthly).toBe(amortise(m(1_450_000), ZERO_PERCENT, 12).payment);
    expect(p.interest).toBe(0);
  });

  it('is missing when the term, the APR or both are absent', () => {
    expect(reasonsOf(loan({ termMonths: null }))).toEqual(['loan_term_missing']);
    expect(reasonsOf(loan({ apr: null }))).toEqual(['loan_apr_missing']);
    expect(reasonsOf(loan({ termMonths: null, apr: null }))).toEqual(['loan_term_missing', 'loan_apr_missing']);
  });

  it.each([0, 601, 1.5])('rejects a term of %s', (termMonths) => {
    expect(() => resolvePlan(loan({ termMonths }))).toThrow(/^resolvePlan: /);
  });
});

describe('resolvePlan: instalment', () => {
  const inst = (amount: number | null, count: number | null, over: Partial<BuyCheck> = {}): BuyCheck =>
    buy(
      { method: 'instalment', instalmentAmount: amount === null ? null : m(amount), instalmentCount: count },
      { price: m(1_180_000), ...over }
    );

  it('resolves with the prototype arithmetic', () => {
    const p = resolved(inst(62_000, 24));
    expect(p).toMatchObject({
      dayOne: 62_000,
      monthly: 62_000,
      months: 24,
      financed: 1_180_000,
      total: 1_488_000,
      interest: 308_000,
      finalMonthly: 62_000,
      paymentSteps: [{ fromMonth: 1, toMonth: 23, amount: 62_000 }],
    });
    expect(p.impliedAnnualRate).toBe(
      percentFromScaled(divideHalfUp(BigInt(1_488_000 - 1_180_000) * 12n * ONE_HUNDRED_PERCENT, 1_180_000n * 24n))
    );
  });

  it('floors interest at zero and reports a zero implied rate when the total is not above the price', () => {
    const p = resolved(inst(40_000, 24));
    expect(p.interest).toBe(0);
    expect(p.impliedAnnualRate).toBe(ZERO_PERCENT);
  });

  it('reports a zero implied rate for a zero price', () => {
    expect(resolved(inst(10_000, 12, { price: m(0) })).impliedAnnualRate).toBe(ZERO_PERCENT);
  });

  it('a single instalment has no later payment steps', () => {
    expect(resolved(inst(1_200_000, 1)).paymentSteps).toEqual([]);
  });

  it('is missing when the amount or the count is absent', () => {
    expect(reasonsOf(inst(null, 24))).toEqual(['instalment_amount_missing']);
    expect(reasonsOf(inst(62_000, null))).toEqual(['instalment_count_missing']);
    expect(reasonsOf(inst(null, null))).toEqual(['instalment_amount_missing', 'instalment_count_missing']);
  });

  it('rejects a negative amount and a zero count', () => {
    expect(() => resolvePlan(inst(-1, 24))).toThrow(/^resolvePlan: /);
    expect(() => resolvePlan(inst(62_000, 0))).toThrow(/^resolvePlan: /);
  });
});

describe('resolvePlan: instalment late fees (D-50)', () => {
  function late(
    count: number,
    over: Partial<Extract<BuyPayment, { method: 'instalment' }>> = {}
  ): BuyCheck {
    return buy(
      { method: 'instalment', instalmentAmount: m(62_000), instalmentCount: count, ...over },
      { price: m(1_400_000) }
    );
  }

  it('reports the cost of one and two late payments, beside an unchanged plan', () => {
    const p = resolved(late(24, { lateFee: m(800) }));
    expect(p.lateFees).toEqual({ feePerLatePayment: 800, capTotal: null, oneLate: 800, twoLate: 1_600 });
    expect({ ...p, lateFees: null }).toEqual(resolved(late(24)));
  });

  it('caps n at the instalments remaining', () => {
    expect(resolved(late(1, { lateFee: m(800) })).lateFees).toMatchObject({ oneLate: 800, twoLate: 800 });
  });

  it('applies the total cap the user entered, and none otherwise', () => {
    expect(resolved(late(24, { lateFee: m(800), lateFeeCapTotal: m(1_000) })).lateFees).toEqual({
      feePerLatePayment: 800,
      capTotal: 1_000,
      oneLate: 800,
      twoLate: 1_000,
    });
    expect(resolved(late(24, { lateFee: m(800), lateFeeCapTotal: m(5_000) })).lateFees).toMatchObject({
      twoLate: 1_600,
    });
  });

  it('a zero fee costs nothing; no fee entered is null', () => {
    expect(resolved(late(24, { lateFee: m(0) })).lateFees).toMatchObject({ oneLate: 0, twoLate: 0 });
    expect(resolved(late(24)).lateFees).toBeNull();
  });

  it('rejects negative amounts and a cap without a fee', () => {
    expect(() => resolvePlan(late(24, { lateFee: m(-1) }))).toThrow(/^resolvePlan: /);
    expect(() => resolvePlan(late(24, { lateFee: m(800), lateFeeCapTotal: m(-1) }))).toThrow(/^resolvePlan: /);
    expect(() => resolvePlan(late(24, { lateFeeCapTotal: m(1_000) }))).toThrow(
      /^resolvePlan: lateFeeCapTotal needs lateFee/
    );
  });
});

describe('resolvePlan: card', () => {
  it('full: paid at the next statement, no APR needed (D-07 refined)', () => {
    const p = resolved(card({ kind: 'full' }, { card: { ...CARD, apr: null, minimumTerms: null } }));
    expect(p).toMatchObject({
      dayOne: 1_450_000,
      monthly: 0,
      months: 0,
      financed: 1_450_000,
      total: 1_450_000,
      interest: 0,
      finalMonthly: null,
      paymentSteps: [],
    });
    expect(p.card).toMatchObject({ payoff: 'full', payoffMonths: 1, onCard: 1_450_000, fees: 0, cardCosts: 0 });
  });

  it('months: amortises the card balance', () => {
    const p = resolved(card({ kind: 'months', months: 12 }));
    const am = amortise(m(1_450_000), pct('22.9'), 12);
    expect(p.monthly).toBe(am.payment);
    expect(p.interest).toBe(am.totalInterest);
    expect(p.dayOne).toBe(0);
    expect(p.months).toBe(12);
    expect(p.finalMonthly).toBe(am.finalPayment);
    expect(p.card).toMatchObject({ onCard: 1_450_000, payoff: 'months', payoffMonths: 12, minimumOutcome: null });
    expect(sumSteps(p)).toBe(p.total! - p.dayOne);
  });

  it('minimum: follows the card record terms and clears', () => {
    const p = resolved(card({ kind: 'minimum' }, {}, { price: m(300_000) }));
    const s = simulateMinimum(m(300_000), pct('22.9'), TERMS);
    expect(s.outcome).toBe('cleared');
    expect(p.monthly).toBe(s.firstPayment);
    expect(p.months).toBe(s.months);
    expect(p.interest).toBe(s.totalInterest);
    expect(p.card).toMatchObject({ minimumOutcome: 'cleared', payoffMonths: s.months });
    expect(p.paymentSteps[p.paymentSteps.length - 1]!.toMonth).toBe(s.months);
    expect(p.finalMonthly).toBeNull();
  });

  it('minimum on a zero balance has no payment steps', () => {
    const p = resolved(card({ kind: 'minimum' }, {}, { price: m(0) }));
    expect(p.paymentSteps).toEqual([]);
    expect(p.interest).toBe(0);
  });

  it('minimum that never clears: interest and total null, steps run to the simulation cap (D-17)', () => {
    const never: CardRecord = { ...CARD, minimumTerms: { ...TERMS, interestAdded: false } };
    const p = resolved(card({ kind: 'minimum' }, { card: never }, { price: m(500_000) }));
    expect(p.interest).toBeNull();
    expect(p.total).toBeNull();
    expect(p.card).toMatchObject({ minimumOutcome: 'never_clears', payoffMonths: null, cardCosts: null });
    expect(p.paymentSteps[p.paymentSteps.length - 1]!.toMonth).toBe(SIMULATION_MONTH_CAP);
    expect(p.paymentSteps[0]!.fromMonth).toBe(1);
  });

  it('minimum that is still open at the month cap reports the cap, not never-clears', () => {
    // A 0.5% minimum without interest added against a tiny APR: payments just exceed interest but 600 months is not enough.
    const slow: CardRecord = {
      ...CARD,
      apr: pct('5'),
      minimumTerms: { minimumPercent: pct('0.5'), interestAdded: false, floor: m(0) },
    };
    const p = resolved(card({ kind: 'minimum' }, { card: slow }, { price: m(1_000_000) }));
    expect(p.card!.minimumOutcome).toBe('exceeds_month_cap');
    expect(p.months).toBe(SIMULATION_MONTH_CAP);
    // 04-REVIEW HI-02: an open balance at the cap is not a cleared cost (was: a finite interest and total)
    expect(p.interest).toBeNull();
    expect(p.total).toBeNull();
    expect(p.card!.payoffMonths).toBeNull();
    expect(p.card!.remainingAtCap).toBeGreaterThan(0);
  });

  it.each<ItemType>(['rent_bill', 'loan_repayment', 'tax', 'insurance_premium'])('blocks %s (D-18)', (itemType) => {
    expect(reasonsOf(card({ kind: 'full' }, {}, { itemType }))).toEqual(['card_not_accepted']);
  });

  it('is missing for absent card terms (D-07, D-16)', () => {
    expect(reasonsOf(card({ kind: 'full' }, { card: null }))).toEqual(['card_missing']);
    expect(reasonsOf(card({ kind: 'months', months: 12 }, { card: null }))).toEqual(['card_missing']);
    expect(reasonsOf(card({ kind: 'months', months: 12 }, { card: { ...CARD, apr: null } }))).toEqual([
      'card_apr_missing',
    ]);
    expect(reasonsOf(card({ kind: 'minimum' }, { card: { ...CARD, apr: null } }))).toEqual(['card_apr_missing']);
    expect(reasonsOf(card({ kind: 'minimum' }, { card: { ...CARD, minimumTerms: null } }))).toEqual([
      'card_minimum_terms_missing',
    ]);
    expect(reasonsOf(card({ kind: 'minimum' }, { card: { ...CARD, apr: null, minimumTerms: null } }))).toEqual([
      'card_apr_missing',
      'card_minimum_terms_missing',
    ]);
    // months does not need minimum terms
    expect(resolvePlan(card({ kind: 'months', months: 12 }, { card: { ...CARD, minimumTerms: null } })).status).toBe(
      'resolved'
    );
  });

  it('vehicle with no dealer cap is missing', () => {
    expect(reasonsOf(card({ kind: 'full' }, {}, { itemType: 'vehicle' }))).toEqual(['dealer_cap_missing']);
    expect(reasonsOf(card({ kind: 'full' }, { card: null }, { itemType: 'vehicle' }))).toEqual([
      'card_missing',
      'dealer_cap_missing',
    ]);
  });

  it('vehicle above the dealer cap puts the excess on day one (D-18)', () => {
    const p = resolved(card({ kind: 'months', months: 12 }, { dealerCap: m(500_000) }, { itemType: 'vehicle' }));
    expect(p.card).toMatchObject({ onCard: 500_000, remainderOnDay: 950_000, eligibility: 'capped' });
    expect(p.dayOne).toBe(950_000);
    expect(p.monthly).toBe(amortise(m(500_000), pct('22.9'), 12).payment);
    expect(p.financed).toBe(500_000);
    expect(p.total).toBe(1_450_000 + amortise(m(500_000), pct('22.9'), 12).totalInterest);
  });

  it('vehicle under the cap uses the card for the whole price', () => {
    const p = resolved(
      card({ kind: 'months', months: 12 }, { dealerCap: m(500_000) }, { itemType: 'vehicle', price: m(400_000) })
    );
    expect(p.card).toMatchObject({ onCard: 400_000, remainderOnDay: 0, eligibility: 'capped' });
  });

  it('a general item on a card is permitted', () => {
    expect(resolved(card({ kind: 'full' })).card!.eligibility).toBe('permitted');
  });

  describe('D-63 card fees', () => {
    it('full payoff: fees are paid on the day and are card costs', () => {
      const p = resolved(card({ kind: 'full' }, { cardFees: m(3_500) }));
      expect(p.dayOne).toBe(1_453_500);
      expect(p.total).toBe(1_453_500);
      expect(p.interest).toBe(0);
      expect(p.card).toMatchObject({ fees: 3_500, cardCosts: 3_500 });
    });

    it('absent fees mean none', () => {
      const p = resolved(card({ kind: 'full' }));
      expect(p.dayOne).toBe(1_450_000);
      expect(p.card).toMatchObject({ fees: 0, cardCosts: 0 });
    });

    it('months: fees are not interest', () => {
      const p = resolved(card({ kind: 'months', months: 12 }, { cardFees: m(3_500) }));
      const am = amortise(m(1_450_000), pct('22.9'), 12);
      expect(p.dayOne).toBe(3_500);
      expect(p.interest).toBe(am.totalInterest);
      expect(p.total).toBe(1_450_000 + am.totalInterest + 3_500);
      expect(p.card!.cardCosts).toBe(am.totalInterest + 3_500);
      expect(p.total! - p.price).toBe(p.card!.cardCosts);
    });

    it('vehicle above the dealer cap adds the fees to the day-one remainder', () => {
      const p = resolved(
        card({ kind: 'months', months: 12 }, { dealerCap: m(500_000), cardFees: m(3_500) }, { itemType: 'vehicle' })
      );
      expect(p.dayOne).toBe(953_500);
    });

    it('minimum that never clears keeps the fee on the day and the costs unbounded', () => {
      const never: CardRecord = { ...CARD, minimumTerms: { ...TERMS, interestAdded: false } };
      const p = resolved(card({ kind: 'minimum' }, { card: never, cardFees: m(3_500) }, { price: m(500_000) }));
      expect(p.interest).toBeNull();
      expect(p.total).toBeNull();
      expect(p.card!.cardCosts).toBeNull();
      expect(p.dayOne).toBe(3_500);
    });

    it.each([-1, 1.5])('rejects card fees of %s', (fee) => {
      expect(() => resolvePlan(card({ kind: 'full' }, { cardFees: fee as never }))).toThrow(/^resolvePlan: /);
    });
  });

  it('rejects a negative dealer cap and a zero payoff term', () => {
    expect(() => resolvePlan(card({ kind: 'full' }, { dealerCap: -1 as never }))).toThrow(/^resolvePlan: /);
    expect(() => resolvePlan(card({ kind: 'months', months: 0 }))).toThrow(/^resolvePlan: /);
  });

  it('rejects a card in another currency (D-16 clarified)', () => {
    const cad: CardRecord = { ...CARD, currency: currencyCode('CAD') };
    expect(() => resolvePlan(card({ kind: 'full' }, { card: cad }))).toThrow(/^resolvePlan: mixed currencies/);
  });
});

describe('resolvePlan: invest', () => {
  const inv = (payment: InvestCheck['payment'], amount = 50_000): InvestCheck => ({
    kind: 'invest',
    currency: USD,
    amount: m(amount),
    payment,
  });

  it('lump sum goes out on the day', () => {
    expect(resolved(inv({ method: 'lump' }))).toMatchObject({
      dayOne: 50_000,
      monthly: 0,
      total: 50_000,
      paymentSteps: [],
      finalMonthly: null,
      card: null,
      dayFees: 0,
    });
  });

  it('monthly contributions run for the term', () => {
    expect(resolved(inv({ method: 'monthly', termMonths: 24 }))).toMatchObject({
      dayOne: 0,
      monthly: 50_000,
      months: 24,
      total: 1_200_000,
      finalMonthly: 50_000,
      paymentSteps: [{ fromMonth: 1, toMonth: 24, amount: 50_000 }],
    });
  });

  it('is missing without a term and rejects an out-of-range one', () => {
    expect(reasonsOf(inv({ method: 'monthly', termMonths: null }))).toEqual(['invest_term_missing']);
    expect(() => resolvePlan(inv({ method: 'monthly', termMonths: 0 }))).toThrow(/^resolvePlan: /);
  });

  it('rejects a negative amount', () => {
    expect(() => resolvePlan(inv({ method: 'lump' }, -1))).toThrow(/^resolvePlan: /);
  });
});

describe('resolvePlanStrict and withPrice', () => {
  it('returns the plan when resolved and throws when missing', () => {
    expect(resolvePlanStrict(buy({ method: 'cash' })).dayOne).toBe(1_450_000);
    expect(() => resolvePlanStrict(loan({ termMonths: null }))).toThrow(
      /resolvePlanStrict: plan is missing \(loan_term_missing\)/
    );
  });

  it('withPrice sets price on buy and amount on invest, leaving other fields', () => {
    const b = withPrice(buy({ method: 'cash' }), m(1_000)) as BuyCheck;
    expect(b.price).toBe(1_000);
    expect(b.dayFees).toBe(0);
    const i = withPrice({ kind: 'invest', currency: USD, amount: m(5), payment: { method: 'lump' } }, m(1_000));
    expect(i).toMatchObject({ kind: 'invest', amount: 1_000, payment: { method: 'lump' } });
  });
});

describe('negative inputs', () => {
  it('rejects a negative price, dayFees and deposit', () => {
    expect(() => resolvePlan(buy({ method: 'cash' }, { price: -1 as never }))).toThrow(/^resolvePlan: /);
    expect(() => resolvePlan(buy({ method: 'cash' }, { dayFees: -1 as never }))).toThrow(/^resolvePlan: /);
    expect(() => resolvePlan(loan({ deposit: -1 as never }))).toThrow(/^resolvePlan: /);
  });
});

describe('payment steps property', () => {
  it('for a resolved loan, steps sum to total minus dayOne', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50_000_000 }),
        fc.integer({ min: 0, max: 50_000_000 }),
        fc.integer({ min: 1, max: 600 }),
        fc.bigInt({ min: 0n, max: 300_000_000_000n }),
        (price, deposit, term, apr) => {
          const p = resolved(
            loan({ deposit: m(deposit), termMonths: term, apr: percentFromScaled(apr) }, { price: m(price) })
          );
          expect(sumSteps(p)).toBe(p.total! - p.dayOne);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('for a resolved card-months plan, steps sum to total minus dayOne', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50_000_000 }),
        fc.integer({ min: 1, max: 600 }),
        fc.bigInt({ min: 0n, max: 300_000_000_000n }),
        (price, months, apr) => {
          const p = resolved(
            card(
              { kind: 'months', months },
              { card: { ...CARD, apr: percentFromScaled(apr) }, cardFees: m(100) },
              { price: m(price) }
            )
          );
          expect(sumSteps(p)).toBe(p.total! - p.dayOne);
        }
      ),
      { numRuns: 150 }
    );
  });
});

const PROMO12: PromoTerms = { apr: ZERO_PERCENT, months: 12, deferredInterest: false };
const PROMO6: PromoTerms = { apr: ZERO_PERCENT, months: 6, deferredInterest: false };

function promoLoan(promo: PromoTerms | undefined, over: Partial<Extract<BuyPayment, { method: 'loan' }>> = {}): BuyCheck {
  return loan(
    { deposit: m(0), termMonths: 36, apr: pct('9.9'), ...(promo === undefined ? {} : { promo }), ...over },
    { price: m(1_200_000) }
  );
}

describe('rateScheduleFor', () => {
  it('is a single rate without a promo and two segments with one', () => {
    expect(rateScheduleFor(pct('9.9'), undefined)).toEqual(singleRate(pct('9.9')));
    expect(rateScheduleFor(pct('9.9'), PROMO12)).toEqual({
      segments: [
        { fromMonth: 1, apr: ZERO_PERCENT },
        { fromMonth: 13, apr: pct('9.9') },
      ],
      deferredInterest: false,
    });
  });
});

describe('resolvePlan: promotional rates (D-48)', () => {
  it('follows the rate schedule on a loan; monthly is the highest payment', () => {
    const p = resolved(promoLoan(PROMO12));
    const am = amortiseSchedule(m(1_200_000), rateScheduleFor(pct('9.9'), PROMO12), 36);
    expect(p.promo).toEqual({
      promoMonths: 12,
      promoApr: ZERO_PERCENT,
      deferredInterest: false,
      paymentDuringPromo: 33_333,
      paymentAfterPromo: am.paymentsByMonth[12],
      clearsBeforePromoEnd: false,
      interestAfterPromo: am.interestAfterPromo,
      deferredInterestCharged: 0,
      deferredInterestCode: null,
      highestMonthlyPayment: am.highestPayment,
      paymentToClearInPromo: 100_000,
    });
    expect(p.monthly).toBe(am.highestPayment);
    expect(p.total).toBe(p.dayOne + am.totalPaid);
    expect(p.interest).toBe(p.total! - p.price);
    expect(p.finalMonthly).toBe(am.finalPayment);
    expect(p.paymentSteps[0]).toEqual({ fromMonth: 1, toMonth: 12, amount: 33_333 });
    expect(p.lateFees).toBeNull();
  });

  it('W3: paymentSteps, not monthly x (months - 1) + finalMonthly, is the series source', () => {
    const p = resolved(promoLoan(PROMO12));
    const am = amortiseSchedule(m(1_200_000), rateScheduleFor(pct('9.9'), PROMO12), 36);
    expect(sumSteps(p)).toBe(am.totalPaid);
    expect(sumSteps(p)).toBe(p.total! - p.dayOne);
    expect(sumSteps(p)).not.toBe(p.monthly * (p.months - 1) + p.finalMonthly!);
    const plain = resolved(promoLoan(undefined));
    expect(plain.promo).toBeNull();
    expect(sumSteps(plain)).toBe(plain.monthly * (plain.months - 1) + plain.finalMonthly!);
  });

  it('charges deferred interest at the promo end when flagged and the balance is open', () => {
    const terms: PromoTerms = { ...PROMO12, deferredInterest: true };
    const p = resolved(promoLoan(terms));
    const am = amortiseSchedule(m(1_200_000), rateScheduleFor(pct('9.9'), terms), 36);
    expect(am.deferredInterestCharged).toBeGreaterThan(0);
    expect(p.promo).toMatchObject({
      deferredInterest: true,
      deferredInterestCharged: am.deferredInterestCharged,
      deferredInterestCode: 'deferred_interest_charged',
    });
    expect(p.monthly).toBe(am.highestPayment);
    expect(p.monthly).toBeGreaterThan(resolved(promoLoan(PROMO12)).monthly);
  });

  it('a promo covering the whole term clears before the promo ends and charges nothing deferred', () => {
    const p = resolved(promoLoan({ apr: ZERO_PERCENT, months: 36, deferredInterest: true }));
    expect(p.promo).toMatchObject({
      clearsBeforePromoEnd: true,
      paymentAfterPromo: null,
      interestAfterPromo: 0,
      deferredInterestCharged: 0,
      deferredInterestCode: null,
    });
  });

  it('a card months plan uses the schedule; a vehicle above the dealer cap promotes onCard only (D-18)', () => {
    const p = resolved(card({ kind: 'months', months: 12 }, { promo: PROMO6 }));
    const am = amortiseSchedule(m(1_450_000), rateScheduleFor(pct('22.9'), PROMO6), 12);
    expect(p.promo).toMatchObject({ paymentDuringPromo: am.payment, highestMonthlyPayment: am.highestPayment });
    expect(p.monthly).toBe(am.highestPayment);
    const v = resolved(
      card({ kind: 'months', months: 12 }, { promo: PROMO6, dealerCap: m(1_000_000) }, { itemType: 'vehicle' })
    );
    const amV = amortiseSchedule(m(1_000_000), rateScheduleFor(pct('22.9'), PROMO6), 12);
    expect(v.dayOne).toBe(450_000);
    expect(v.promo!.highestMonthlyPayment).toBe(amV.highestPayment);
  });

  it('a card minimum with a promo reports the simulation outcome', () => {
    const p = resolved(card({ kind: 'minimum' }, { promo: PROMO6 }));
    const s = simulateMinimumSchedule(m(1_450_000), rateScheduleFor(pct('22.9'), PROMO6), TERMS);
    expect(p.promo).toMatchObject({
      paymentDuringPromo: s.firstPayment,
      paymentAfterPromo: s.paymentAfterPromo,
      clearsBeforePromoEnd: s.clearedBeforePromoEnd,
      interestAfterPromo: s.interestAfterPromo,
      highestMonthlyPayment: s.highestPayment,
    });
    expect(p.monthly).toBe(p.promo!.highestMonthlyPayment);
    expect(p.promo!.paymentToClearInPromo).toBe(amortise(m(1_450_000), ZERO_PERCENT, 6).payment);
  });

  it('a card minimum that never clears after the promo has null interest and total', () => {
    const hard: CardRecord = {
      ...CARD,
      apr: pct('30'),
      minimumTerms: { minimumPercent: pct('0.5'), interestAdded: false, floor: m(0) },
    };
    const p = resolved(card({ kind: 'minimum' }, { card: hard, promo: PROMO6 }));
    expect(p.card!.minimumOutcome).toBe('never_clears');
    expect(p.promo!.interestAfterPromo).toBeNull();
    expect(p.total).toBeNull();
    expect(p.card!.cardCosts).toBeNull();
  });

  it('a full payoff with a promo has no promo outcome', () => {
    expect(resolved(card({ kind: 'full' }, { promo: PROMO12 })).promo).toBeNull();
  });

  it('D-07: the rate after the promo is still required', () => {
    expect(reasonsOf(promoLoan(PROMO12, { apr: null }))).toEqual(['loan_apr_missing']);
    const noApr: CardRecord = { ...CARD, apr: null };
    expect(reasonsOf(card({ kind: 'months', months: 12 }, { card: noApr, promo: PROMO12 }))).toEqual([
      'card_apr_missing',
    ]);
  });

  it('rejects bad promo terms', () => {
    for (const months of [0, 1.5, 601]) {
      expect(() => resolvePlan(promoLoan({ ...PROMO12, months }))).toThrow(/^resolvePlan: /);
    }
    expect(() => resolvePlan(promoLoan({ apr: pct('1'), months: 6, deferredInterest: true }))).toThrow(
      /^resolvePlan: deferred interest needs a 0% promotional rate/
    );
  });

  it('D-49: the variable flag changes nothing in the plan', () => {
    const base = resolved(promoLoan(undefined));
    expect(resolved(promoLoan(undefined, { variable: true }))).toEqual(base);
    expect(resolved(promoLoan(undefined, { variable: false }))).toEqual(base);
    expect(resolved(card({ kind: 'months', months: 12 }, { variable: true }))).toEqual(
      resolved(card({ kind: 'months', months: 12 }))
    );
    expect(() => resolvePlan(promoLoan(undefined, { variable: 'yes' as never }))).toThrow(/^resolvePlan: /);
    expect(() => resolvePlan(card({ kind: 'full' }, { variable: 1 as never }))).toThrow(/^resolvePlan: /);
  });

  it('D-63: card costs on a promo plan are the schedule interest plus the one-off card fees', () => {
    const p = resolved(card({ kind: 'months', months: 12 }, { promo: PROMO6, cardFees: m(3_500) }));
    expect(p.card!.cardCosts).toBe(p.interest! + 3_500);
    expect(p.card!.fees).toBe(3_500);
    expect(p.dayOne).toBe(3_500);
    expect(p.total! - p.price).toBe(p.card!.cardCosts);
    const deferred: PromoTerms = { ...PROMO6, deferredInterest: true };
    const d = resolved(card({ kind: 'months', months: 12 }, { promo: deferred, cardFees: m(3_500) }));
    const am = amortiseSchedule(m(1_450_000), rateScheduleFor(pct('22.9'), deferred), 12);
    expect(d.promo!.deferredInterestCharged).toBeGreaterThan(0);
    expect(d.interest).toBe(am.totalInterest);
    expect(d.card!.cardCosts).toBe(am.totalInterest + 3_500);
    expect(d.total! - d.price).toBe(d.card!.cardCosts);
  });

  it('property: monthly is the highest step and the steps sum to the series', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 300_000_000_000n }),
        fc.integer({ min: 1, max: 36 }),
        fc.integer({ min: 0, max: 36 }),
        fc.boolean(),
        fc.bigInt({ min: 0n, max: 300_000_000_000n }),
        (postApr, promoMonths, extra, deferred, promoApr) => {
          const terms: PromoTerms = {
            apr: deferred ? ZERO_PERCENT : percentFromScaled(promoApr),
            months: promoMonths,
            deferredInterest: deferred,
          };
          const p = resolved(
            promoLoan(terms, { termMonths: promoMonths + extra, apr: percentFromScaled(postApr) })
          );
          expect(p.monthly).toBe(Math.max(...p.paymentSteps.map((s) => s.amount)));
          expect(sumSteps(p)).toBe(p.total! - p.dayOne);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('exhaustiveness guards', () => {
  it('throw on an unknown check kind, payment method or card payoff', () => {
    expect(() => resolvePlan({ kind: 'nope' } as never)).toThrow(/Unhandled check kind/);
    expect(() => resolvePlan(buy({ method: 'nope' } as never))).toThrow(/Unhandled payment method/);
    expect(() => resolvePlan(card({ kind: 'nope' } as never))).toThrow(/Unhandled card payoff/);
    expect(() =>
      resolvePlan({ kind: 'invest', currency: USD, amount: m(1), payment: { method: 'nope' } } as never)
    ).toThrow(/Unhandled invest payment method/);
  });
});
