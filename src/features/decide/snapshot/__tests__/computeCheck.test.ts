import * as fc from 'fast-check';
import { ZERO_PERCENT, percent, rateScheduleFor, resolvePlan } from '@/engine/decide';
import type { BuyCheck, StackedCheckInput } from '@/engine/decide';
import * as assessModule from '@/engine/decide/assess';
import * as decisionModule from '@/engine/decide/decision';
import * as firstReadModule from '@/engine/decide/firstRead';
import { minorUnits } from '@/engine/money';
import { amortiseSchedule } from '@/engine/payoff';
import { computeChip, computeCheck, computeCore, computeDetails, computeQuick } from '../computeCheck';
import { defaultQuickInputs, emptyCheckInputs, parseCheckInputs, quickToCheckInputs, toEngineCheck } from '../checkInputs';
import { CREDIT_TERMS } from '../types';
import type { CardChoice, CheckInputs, QuickInputs, SnapshotResult } from '../types';
import { CARD_CHOICE, TODAY, USD, loggedSource, noneSource, roughSource, unconvertedSource } from './helpers/snapshotFixtures';

const CTX = { currency: USD, cards: [CARD_CHOICE], dealerCap: minorUnits(5_000_000) };

function buy(over: Partial<CheckInputs> = {}): CheckInputs {
  return { ...emptyCheckInputs('buy', TODAY), name: 'Laptop', advertised: 150_000, method: 'cash', ...over };
}
function other(price = 100_000): StackedCheckInput {
  const r = toEngineCheck(buy({ advertised: price }), CTX);
  if (!r.ok) throw new Error('other check');
  return { check: r.check, purchaseRule: null };
}
function quick(over: Partial<QuickInputs> = {}): QuickInputs {
  return { ...defaultQuickInputs(), name: 'Laptop', price: 150_000, ...over };
}
afterEach(() => jest.restoreAllMocks());

describe('computeQuick', () => {
  it('is incomplete without a price', () => {
    expect(computeQuick(loggedSource(), quick({ price: null }), { allowCashOnly: false })).toEqual({ kind: 'incomplete' });
    expect(computeQuick(loggedSource(), quick({ price: 0 }), { allowCashOnly: false })).toEqual({ kind: 'incomplete' });
  });
  it('runs the full verdict through decide() when months are logged', () => {
    const r = computeQuick(loggedSource(), quick(), { allowCashOnly: false });
    if (r.kind !== 'logged') throw new Error(r.kind);
    expect(r.verdict).toBe(r.decision.verdict);
    expect(r.check.payment.method).toBe('cash');
    expect(r.resolvedPrice.price).toBe(150_000);
  });
  it('Credit at 0% is assessed with a zero rate, never missing', () => {
    const r = computeQuick(loggedSource(), quick({ mode: 'credit', aprText: '0', termMonths: 12 }), { allowCashOnly: false });
    if (r.kind !== 'logged') throw new Error(r.kind);
    expect(r.verdict.state).not.toBe('missing');
    expect((r.check.payment as { apr: bigint }).apr).toBe(ZERO_PERCENT);
    if (r.verdict.state !== 'missing') expect(r.verdict.plan.interest).toBe(0);
  });
  it('passes the other open checks to decide', () => {
    const r = computeQuick(loggedSource(), quick(), { allowCashOnly: false, otherChecks: [other()] });
    if (r.kind !== 'logged') throw new Error(r.kind);
    expect(r.decision.standalone).not.toBeNull();
  });
  it('uses the first read on rough figures and never a verdict', () => {
    const r = computeQuick(roughSource(), quick(), { allowCashOnly: false });
    if (r.kind !== 'first_read') throw new Error(r.kind);
    expect(r.firstRead.basisMarker).toBe('first_read_rough_figures');
  });
  it('none on home gives kind none', () => {
    expect(computeQuick(noneSource(), quick(), { allowCashOnly: false })).toEqual({ kind: 'none' });
  });
  it('the skip path is cash only', () => {
    const r = computeQuick(noneSource(400_000), quick({ price: 150_000 }), { allowCashOnly: true });
    if (r.kind !== 'cash_only') throw new Error(r.kind);
    expect(r).toMatchObject({ dayOne: 150_000, cashAfter: 250_000, monthly: null, termMonths: null, months: null });
    for (const key of ['verdict', 'firstRead', 'state']) expect(key in r).toBe(false);
    const credit = computeQuick(noneSource(400_000), quick({ price: 120_000, mode: 'credit', aprText: '0', termMonths: 12 }), { allowCashOnly: true });
    if (credit.kind !== 'cash_only') throw new Error(credit.kind);
    expect(credit.monthly).toBe(10_000);
    expect(credit.months).toBe(12);
    expect(credit.dayOne).toBe(0);
  });
  it('the cash-only credit result keeps the term and the payoff month apart', () => {
    const a = computeQuick(noneSource(), quick({ price: 1_000, mode: 'credit', aprText: '0', termMonths: 12 }), { allowCashOnly: true });
    expect(a).toMatchObject({ kind: 'cash_only', monthly: 84, termMonths: 12, months: 12 });
    const b = computeQuick(noneSource(), quick({ price: 10, mode: 'credit', aprText: '0', termMonths: 12 }), { allowCashOnly: true });
    expect(b).toMatchObject({ kind: 'cash_only', monthly: 1, termMonths: 12, months: 10 });
  });
  it('cash only gives none when the terms do not resolve', () => {
    expect(computeQuick(noneSource(), quick({ mode: 'credit', aprText: 'abc' }), { allowCashOnly: true })).toEqual({ kind: 'none' });
  });
  it('an unconverted source never gives a figure', () => {
    for (const kind of ['logged', 'rough', 'none'] as const) {
      expect(computeQuick(unconvertedSource(kind), quick(), { allowCashOnly: true })).toEqual({ kind: 'unconverted', currencies: ['EUR'] });
    }
  });
  it('the quick verdict equals the full check verdict for the same inputs (D-01)', () => {
    const source = loggedSource();
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.constantFrom('cash' as const, 'credit' as const),
        fc.constantFrom('0', '4.9', '19.99'),
        fc.constantFrom(...CREDIT_TERMS),
        (price, mode, aprText, termMonths) => {
          const q = quick({ price, mode, aprText, termMonths });
          const quickResult = computeQuick(source, q, { allowCashOnly: false });
          const full = computeCheck(source, quickToCheckInputs(q, TODAY));
          if (quickResult.kind !== 'logged') throw new Error(quickResult.kind);
          expect(quickResult.verdict).toEqual(full.verdict);
        }
      ),
      { numRuns: 150 }
    );
  });
});

describe('computeCheck', () => {
  it('is incomplete without a price or a method', () => {
    const noPrice = computeCheck(loggedSource(), buy({ advertised: null }));
    expect(noPrice).toMatchObject({ status: 'incomplete', missingInput: 'price', check: null, resolvedPrice: null, running: null, decision: null, verdict: null, firstRead: null, context: null, options: [], alternatives: null, setbacks: null, waitPlan: null, investmentViews: null, incomeAtRisk: null, promoBalanceAtEnd: {}, unconverted: null });
    expect(noPrice.runningCostPrompts).toEqual(['insurance', 'maintenance', 'loss_of_value']);
    expect(computeCheck(loggedSource(), buy({ method: null })).missingInput).toBe('method');
    expect(computeCheck(loggedSource(), { ...emptyCheckInputs('invest', TODAY), advertised: null }).runningCostPrompts).toEqual([]);
  });
  it('computeCheck calls decide once and reads the combined context', () => {
    const spy = jest.spyOn(decisionModule, 'decide');
    const c = computeCheck(loggedSource(), buy());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(c.status).toBe('logged');
    expect(c.decision!.verdict).toBe(c.verdict);
    expect(c.verdict!.state).not.toBe('missing');
    if (c.verdict!.state !== 'missing') expect(c.context).toBe(c.verdict!.context);
    expect(c.decision!.standalone).toBeNull();
  });
  it('combine off judges the check on its own', () => {
    const src = loggedSource();
    const alone = computeCheck(src, buy(), []);
    const off = computeCheck(src, buy({ combine: false }), [other()]);
    expect(off.decision!.standalone).toBeNull();
    expect(off.verdict).toEqual(alone.verdict);
    const on = computeCheck(src, buy({ combine: true }), [other()]);
    expect(on.decision!.standalone).not.toBeNull();
    expect(computeChip(src, buy({ combine: false }), [other()]).status).toBe('logged');
  });
  it('fills the options, alternatives, setbacks, wait plan, views and income at risk from the combined verdict', () => {
    const inputs = buy({
      advertised: 1_450_000, projectionRates: ['4'], cheaperRatioPercent: 50, wait: { monthlyAmount: 20_000 }, investHorizonMonths: 24, investHoldingFeeText: '1',
      setbacks: emptyCheckInputs('buy', TODAY).setbacks.map((s) => ({ ...s, enabled: true, amount: s.code === 'unexpected_expense' ? 5_000 : null })),
    });
    const c = computeCheck(loggedSource(), inputs);
    expect(c.options.length).toBeGreaterThan(0);
    expect(c.alternatives!.rows).toHaveLength(4);
    expect(c.alternatives!.cheaper.ratioPercent).toBe(50);
    expect(c.setbacks!.anyEnabled).toBe(true);
    expect(c.setbacks!.results.map((r) => r.code)).toEqual(['unexpected_expense', 'income_drop', 'job_loss', 'late_invoice']);
    expect(c.waitPlan!.monthlyAmount).toBe(20_000);
    expect(c.incomeAtRisk!.setbacks.map((r) => r.code)).toEqual(c.setbacks!.results.map((r) => r.code));
    expect(c.investmentViews!.horizonMonths).toBe(24);
    expect(c.investmentViews!.rates.map((r) => r.rate)).toEqual([ZERO_PERCENT, percent('4')]);
  });
  it('the holding fee reaches the investing views', () => {
    const withFee = computeCheck(loggedSource(), buy({ projectionRates: ['4', '6'], investHoldingFeeText: '1' }));
    expect(withFee.investmentViews!.holdingFee).toBe(percent('1'));
    expect(withFee.investmentViews!.netRates.length).toBe(withFee.investmentViews!.rates.length);
    expect(computeCheck(loggedSource(), buy({ projectionRates: ['4'] })).investmentViews!.holdingFee).toBe(ZERO_PERCENT);
  });
  it('uses the check own rate list for the engine and memoises the snapshot', () => {
    const spy = jest.spyOn(decisionModule, 'decide');
    const src = loggedSource();
    computeCheck(src, buy({ projectionRates: ['4', '6'] }));
    computeCheck(src, buy({ projectionRates: ['4', '6'] }));
    const first = spy.mock.calls[0]![0];
    expect(first.projectionRates).toEqual([percent('4'), percent('6')]);
    expect(first.projectionReturn).toBe(percent('4'));
    expect(spy.mock.calls[1]![0]).toBe(first);
    computeCheck(src, buy());
    expect(spy.mock.calls[2]![0].projectionReturn).toBeNull();
  });
  it('resolves each method on its own', () => {
    const c = computeCheck(loggedSource(), buy({ loan: { ...emptyCheckInputs('buy', TODAY).loan, aprText: '9', termMonths: 24 }, instalment: { amount: 15_000, count: 12, lateFee: null }, card: { ...emptyCheckInputs('buy', TODAY).card, accountId: 'acc-card' } }));
    expect(Object.keys(c.methodPlans).sort()).toEqual(['card', 'cash', 'instalment', 'loan']);
    expect(c.methodPlans.cash!.status).toBe('resolved');
    expect(c.methodPlans.loan!.status).toBe('resolved');
    const bare = computeCheck(loggedSource(), buy());
    expect(bare.methodPlans.loan!.status).toBe('missing');
    expect(bare.methodPlans.instalment!.status).toBe('missing');
    const inv = computeCheck(loggedSource(), { ...emptyCheckInputs('invest', TODAY), advertised: 100_000, investTermMonths: 12 });
    expect(Object.keys(inv.methodPlans).sort()).toEqual(['lump', 'monthly']);
    expect(inv.investmentViews).toBeNull();
    expect(inv.incomeAtRisk).toBeNull();
    expect(inv.status).toBe('logged');
  });
  it('a missing verdict gives no detail figures', () => {
    const c = computeCheck(loggedSource(), buy({ method: 'loan' }));
    expect(c.verdict!.state).toBe('missing');
    expect(c).toMatchObject({ status: 'logged', context: null, options: [], alternatives: null, setbacks: null, waitPlan: null, investmentViews: null, incomeAtRisk: null });
  });
  it('none gives status none, not a first read', () => {
    const c = computeCheck(noneSource(), buy());
    expect(c).toMatchObject({ status: 'none', firstRead: null, decision: null, verdict: null, context: null, alternatives: null, setbacks: null, waitPlan: null, options: [] });
    expect(c.check).not.toBeNull();
    expect(c.resolvedPrice).not.toBeNull();
    expect(c.running).not.toBeNull();
    expect(Object.keys(c.methodPlans)).toHaveLength(4);
  });
  it('rough figures give a first read and no decision', () => {
    const c = computeCheck(roughSource(), buy());
    expect(c.status).toBe('first_read');
    expect(c.firstRead!.basisMarker).toBe('first_read_rough_figures');
    expect(c.decision).toBeNull();
  });
  it('an unconverted source never produces a verdict', () => {
    const decideSpy = jest.spyOn(decisionModule, 'decide');
    const assessSpy = jest.spyOn(assessModule, 'assess');
    const firstReadSpy = jest.spyOn(firstReadModule, 'firstRead');
    for (const kind of ['logged', 'rough', 'none'] as const) {
      const c = computeCheck(unconvertedSource(kind), buy());
      expect(c).toMatchObject({ status: 'unconverted', unconverted: { currencies: ['EUR'] }, decision: null, verdict: null, firstRead: null, options: [] });
      expect(c.check).not.toBeNull();
      expect(c.methodPlans.cash).toBeDefined();
      expect(computeChip(unconvertedSource(kind), buy())).toMatchObject({ status: 'unconverted', method: 'cash', price: 150_000 });
    }
    expect(decideSpy).not.toHaveBeenCalled();
    expect(assessSpy).not.toHaveBeenCalled();
    expect(firstReadSpy).not.toHaveBeenCalled();
  });
  it('is pure and deterministic', () => {
    const inputs = buy({ advertised: 1_450_000, projectionRates: ['5'] });
    expect(computeCheck(loggedSource(), inputs)).toEqual(computeCheck(loggedSource(), inputs));
  });
  it('core plus details equals the full computation', () => {
    for (const src of [loggedSource(), roughSource(), noneSource(), unconvertedSource('logged')]) {
      const inputs = buy({ advertised: 900_000 });
      const core = computeCore(src, inputs);
      expect(core.inputs).toBe(inputs);
      expect(core.options).toEqual([]);
      expect(core.alternatives).toBeNull();
      expect(core.investmentViews).toBeNull();
      const details = computeDetails(core, inputs);
      expect('inputs' in details).toBe(false);
      expect(details).toEqual(computeCheck(src, inputs));
      expect(computeCore(src, inputs).verdict).toEqual(core.verdict);
    }
    const incomplete = computeCore(loggedSource(), buy({ advertised: null }));
    expect(computeDetails(incomplete, buy({ advertised: null })).status).toBe('incomplete');
  });
  it('loss of value changes neither the running cost net nor the verdict (D-44)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1_000, max: 3_000_000 }),
        fc.oneof(
          fc.record({ kind: fc.constant('amount' as const), monthly: fc.integer({ min: 1, max: 500_000 }) }),
          fc.record({ kind: fc.constant('percent_per_year' as const), percentText: fc.constantFrom('1', '15', '100') })
        ),
        fc.constantFrom('cash' as const, 'loan' as const),
        (advertised, lossOfValue, method) => {
          const loan = { ...emptyCheckInputs('buy', TODAY).loan, aprText: '5', termMonths: 24 };
          const without = computeCheck(loggedSource(), buy({ advertised, method, loan, lossOfValue: null }));
          const withIt = computeCheck(loggedSource(), buy({ advertised, method, loan, lossOfValue }));
          expect((withIt.check as BuyCheck).runningCostsNet).toBe((without.check as BuyCheck).runningCostsNet);
          expect(withIt.verdict).toEqual(without.verdict);
          expect(withIt.running!.nonCash).toBeGreaterThan(0);
          expect(without.running!.nonCash).toBe(0);
        }
      ),
      { numRuns: 60 }
    );
  });
});

describe('promoBalanceAtEnd', () => {
  const loanBase = emptyCheckInputs('buy', TODAY).loan;
  it('the balance left at the promotion end comes from the engine schedule', () => {
    const inputs = buy({ advertised: 1_200_000, method: 'loan', loan: { ...loanBase, aprText: '9.9', termMonths: 48, promo: { aprText: '0', months: 12, deferredInterest: false } } });
    const c = computeCheck(loggedSource(), inputs);
    const plan = c.methodPlans.loan!;
    if (plan.status !== 'resolved') throw new Error('plan');
    const expected = amortiseSchedule(plan.plan.financed, rateScheduleFor(percent('9.9'), { apr: ZERO_PERCENT, months: 12, deferredInterest: false }), 48).balanceAtPromoEnd;
    expect(expected).toBeGreaterThan(0);
    expect(c.promoBalanceAtEnd.loan).toBe(expected);
    const clears = computeCheck(loggedSource(), buy({ advertised: 100_000, method: 'loan', loan: { ...loanBase, aprText: '9.9', termMonths: 12, promo: { aprText: '0', months: 12, deferredInterest: false } } }));
    const p2 = clears.methodPlans.loan!;
    if (p2.status !== 'resolved') throw new Error('plan');
    expect(p2.plan.promo!.clearsBeforePromoEnd).toBe(true);
    expect(clears.promoBalanceAtEnd.loan).toBe(0);
    expect(computeCheck(loggedSource(), buy({ method: 'loan' })).promoBalanceAtEnd).toEqual({});
  });
  it('reads the card months and minimum schedules, including a minimum that stops early', () => {
    const cardBase = { ...emptyCheckInputs('buy', TODAY).card, accountId: 'acc-card', promo: { aprText: '0', months: 6, deferredInterest: false } };
    const months = computeCheck(loggedSource(), buy({ advertised: 600_000, method: 'card', card: { ...cardBase, payoff: 'months', months: 24 } }));
    const mp = months.methodPlans.card!;
    if (mp.status !== 'resolved') throw new Error('plan');
    expect(mp.plan.promo).not.toBeNull();
    expect(months.promoBalanceAtEnd.card).toBe(amortiseSchedule(mp.plan.card!.onCard, rateScheduleFor(percent('19.99'), { apr: ZERO_PERCENT, months: 6, deferredInterest: false }), 24).balanceAtPromoEnd);
    const minimum = computeCheck(loggedSource(), buy({ advertised: 600_000, method: 'card', card: { ...cardBase, payoff: 'minimum' } }));
    expect(minimum.promoBalanceAtEnd.card).toBeGreaterThan(0);
    const early = computeCheck(loggedSource(), buy({ advertised: 10_000, method: 'card', card: { ...cardBase, payoff: 'minimum', promo: { aprText: '0', months: 12, deferredInterest: false } } }));
    expect(early.promoBalanceAtEnd.card).toBe(0);
    const stuck: CardChoice = {
      ...CARD_CHOICE,
      record: { ...CARD_CHOICE.record, apr: percent('36'), minimumTerms: { minimumPercent: percent('1'), interestAdded: false, floor: minorUnits(0) } },
    };
    const never = computeCheck({ ...loggedSource(), cards: [stuck] }, buy({ advertised: 600_000, method: 'card', card: { ...cardBase, payoff: 'minimum', promo: { aprText: '36', months: 12, deferredInterest: false } } }));
    const np = never.methodPlans.card!;
    if (np.status !== 'resolved') throw new Error('plan');
    expect(np.plan.card!.minimumOutcome).toBe('never_clears');
    expect(never.promoBalanceAtEnd.card).toBeGreaterThan(0);
    const fullPay = computeCheck(loggedSource(), buy({ advertised: 600_000, method: 'card', card: { ...cardBase, payoff: 'full' } }));
    expect(fullPay.promoBalanceAtEnd).toEqual({});
  });
});

describe('computeChip', () => {
  it('is incomplete without a price or a method', () => {
    expect(computeChip(loggedSource(), buy({ advertised: null }))).toEqual({ status: 'incomplete', missingInput: 'price', price: null });
    expect(computeChip(loggedSource(), buy({ method: null }))).toEqual({ status: 'incomplete', missingInput: 'method', price: 150_000 });
  });
  it('is the cheaper assess() entry on logged months', () => {
    const spy = jest.spyOn(decisionModule, 'decide');
    const chip = computeChip(loggedSource(), buy({ advertised: 1_450_000 }));
    expect(spy).not.toHaveBeenCalled();
    if (chip.status !== 'logged') throw new Error(chip.status);
    expect(chip).toMatchObject({ price: 1_450_000, method: 'cash' });
    expect(chip.left).not.toBeNull();
    const missing = computeChip(loggedSource(), buy({ method: 'loan' }));
    expect(missing).toMatchObject({ status: 'logged', state: 'missing', left: null });
  });
  it('rough and none sources', () => {
    const rough = computeChip(roughSource(), buy());
    expect(rough).toMatchObject({ status: 'first_read', method: 'cash', price: 150_000 });
    const roughMissing = computeChip(roughSource(), buy({ method: 'loan' }));
    expect(roughMissing).toMatchObject({ status: 'first_read', state: 'missing', left: null });
    expect(computeChip(noneSource(), buy())).toEqual({ status: 'none', price: 150_000, method: 'cash' });
  });
  it('the list chip and the step-3 verdict never disagree', () => {
    const source = loggedSource();
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6_000_000 }),
        fc.constantFrom('cash' as const, 'loan' as const, 'instalment' as const, 'card' as const),
        fc.boolean(),
        (advertised, method, withOthers) => {
          const inputs = buy({
            advertised, method,
            loan: { ...emptyCheckInputs('buy', TODAY).loan, aprText: '7', termMonths: 36 },
            instalment: { amount: Math.ceil(advertised / 10), count: 12, lateFee: null },
            card: { ...emptyCheckInputs('buy', TODAY).card, accountId: 'acc-card' },
          });
          const others = withOthers ? [other(200_000)] : [];
          const chip = computeChip(source, inputs, others);
          const full = computeCheck(source, inputs, others);
          if (chip.status !== 'logged') throw new Error(chip.status);
          expect(chip.state).toBe(full.verdict!.state);
        }
      ),
      { numRuns: 120 }
    );
  });
});

// ── never-throw and timing ──
const wrap = <T>(valid: fc.Arbitrary<T>, bad: fc.Arbitrary<unknown>) => fc.oneof({ weight: 9, arbitrary: valid as fc.Arbitrary<unknown> }, { weight: 1, arbitrary: bad });
const BAD_NUMBER = fc.constantFrom(-1, 1.5, 2 ** 60, 10 ** 6, 601, 0, 101, 10 ** 4, Number.NaN, 'x');
const money = wrap(fc.integer({ min: 0, max: 3_000_000 }), BAD_NUMBER);
const months = wrap(fc.integer({ min: 1, max: 120 }), BAD_NUMBER);
const rate = wrap(fc.constantFrom('0', '4.5', '9.9', '19.99', '36'), fc.constantFrom('250', 'abc', '', '100.0000000001', '1000'));
const promo = wrap(fc.record({ aprText: rate, months, deferredInterest: fc.boolean() }), fc.constant(null));
const line = fc.record({
  id: fc.constantFrom('a', 'b', 'c'),
  name: fc.string({ maxLength: 5 }),
  amount: money,
  note: fc.constant(''),
  counted: fc.boolean(),
  effect: fc.constantFrom('adds', 'takes_off', 'weird'),
  onDay: fc.boolean(),
  taxPercentText: wrap(fc.constantFrom('0', '6', '7.5'), fc.constantFrom('250', 'abc')),
  seriesId: fc.constant(null),
  category: fc.constantFrom(null, 'insurance', 'fuel', 'loss_of_value', 'bogus'),
});
const inputsArb = fc.record({
  v: fc.constant(1),
  kind: fc.constantFrom('buy', 'buy', 'buy', 'invest'),
  name: fc.constantFrom('car', 'Laptop', 'rent'),
  itemType: fc.constantFrom('general', 'vehicle', 'tax', 'bogus'),
  advertised: wrap(fc.integer({ min: 1_000, max: 3_000_000 }), BAD_NUMBER),
  needBy: wrap(fc.constant('2026-12-01'), fc.constant('2026-02-30')),
  method: wrap(fc.constantFrom('cash', 'loan', 'instalment', 'card', 'lump', 'monthly'), fc.constant('zzz')),
  adjustments: fc.array(line, { maxLength: 3 }),
  runningCosts: fc.array(line, { maxLength: 3 }),
  replaces: fc.array(line, { maxLength: 2 }),
  lossOfValue: wrap(fc.constantFrom({ kind: 'amount', monthly: 10_000 }, { kind: 'percent_per_year', percentText: '15' }), fc.constant({ kind: 'percent_per_year', percentText: '250' })),
  loan: fc.record({ deposit: money, termMonths: months, aprText: rate, promo, variable: fc.boolean(), secured: fc.boolean() }),
  instalment: fc.record({ amount: money, count: months, lateFee: money }),
  card: fc.record({ accountId: fc.constantFrom('acc-card', 'nope', null), payoff: fc.constantFrom('full', 'months', 'minimum', 'x'), months, promo, variable: fc.boolean(), fees: money }),
  investTermMonths: months,
  investHorizonMonths: months,
  investHoldingFeeText: wrap(fc.constantFrom('0', '1', '2.5'), fc.constantFrom('101', 'x')),
  projectionRates: fc.array(rate, { maxLength: 4 }),
  setbacks: fc.array(
    fc.record({ code: fc.constantFrom('unexpected_expense', 'income_drop', 'job_loss', 'late_invoice'), enabled: fc.boolean(), amount: money, percentDrop: wrap(fc.integer({ min: 0, max: 100 }), BAD_NUMBER), months, daysLate: wrap(fc.integer({ min: 0, max: 90 }), BAD_NUMBER) }),
    { maxLength: 5 }
  ),
  incomeChange: wrap(fc.record({ direction: fc.constantFrom('raises', 'lowers'), amount: money, startDate: wrap(fc.constant('2027-01-01'), fc.constant('2026-02-30')), likelihood: fc.constantFrom('likely', 'uncertain') }), fc.constant(null)),
  cheaperRatioPercent: wrap(fc.integer({ min: 30, max: 100 }), BAD_NUMBER),
  wait: fc.record({ monthlyAmount: money }),
  combine: fc.boolean(),
});

describe('robustness', () => {
  it('no stored check can make the engine throw', () => {
    const sources: SnapshotResult[] = [loggedSource(), roughSource(), noneSource()];
    let logged = 0;
    let resolved = 0;
    let total = 0;
    fc.assert(
      fc.property(inputsArb, fc.boolean(), (raw, withOthers) => {
        const parsed = parseCheckInputs(JSON.parse(JSON.stringify(raw)), TODAY);
        const others = withOthers ? [other(80_000)] : [];
        for (const src of sources) {
          const c = computeCheck(src, parsed, others);
          computeChip(src, parsed, others);
          computeQuick(src, { name: parsed.name, price: parsed.advertised, mode: parsed.method === 'loan' ? 'credit' : 'cash', aprText: parsed.loan.aprText, termMonths: 12, taxText: '', fees: null }, { allowCashOnly: true, otherChecks: others });
          if (src.kind === 'logged') {
            total += 1;
            if (c.status === 'logged') {
              logged += 1;
              if (c.verdict!.state !== 'missing') resolved += 1;
            }
          }
        }
      }),
      { numRuns: 250 }
    );
    expect(logged / total).toBeGreaterThanOrEqual(0.5);
    expect(resolved / total).toBeGreaterThanOrEqual(0.2);
  });
  it('a heavy check computes within the live-recompute budget', () => {
    const base = emptyCheckInputs('buy', TODAY);
    const heavy: CheckInputs = {
      ...base, name: 'Car', advertised: 1_450_000, method: 'card', itemType: 'vehicle',
      card: { ...base.card, accountId: 'acc-card', payoff: 'minimum', promo: { aprText: '0', months: 12, deferredInterest: false } },
      projectionRates: ['3', '5', '7'], investHorizonMonths: 600,
      setbacks: base.setbacks.map((s) => ({ ...s, enabled: true })),
    };
    const times: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = Date.now();
      computeCheck(loggedSource(), heavy, [other(100_000), other(200_000)]);
      times.push(Date.now() - t0);
    }
    const median = [...times].sort((a, b) => a - b)[2]!;
    console.log(`heavy computeCheck median ${median} ms`);
    if (process.env.CI) expect(median).toBeLessThan(250);
  });
});

describe('resolvePlan stays consistent with the carried quick check', () => {
  it('the quick credit check resolves a plan', () => {
    const r = toEngineCheck(quickToCheckInputs(quick({ mode: 'credit' }), TODAY), CTX);
    if (!r.ok) throw new Error('missing');
    expect(resolvePlan(r.check).status).toBe('resolved');
  });
});
