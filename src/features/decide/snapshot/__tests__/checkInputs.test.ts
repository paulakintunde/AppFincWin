import * as fc from 'fast-check';
import { ZERO_PERCENT, percent, resolvePlan, salesTaxAmount, withPrice } from '@/engine/decide';
import type { BuyCheck, MinorUnits } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import {
  MAX_APR,
  MAX_INPUT_MINOR,
  defaultQuickInputs,
  effectiveMethod,
  cheaperFinalPrice,
  cheaperPriceForPercent,
  emptyCheckInputs,
  isValidAprText,
  isValidProjectionRateText,
  isValidRateText,
  finalPriceOf,
  parseCheckInputs,
  quickToCheckInputs,
  repriceInputs,
  securedDefault,
  toEngineCheck,
  typedRateAbove,
  uniqueReplaces,
  withItemType,
} from '../checkInputs';
import type { AdjustmentLine, CheckInputs, InputLine } from '../types';
import { CARD_CHOICE, TODAY, USD } from './helpers/snapshotFixtures';

const CTX = { currency: USD, cards: [CARD_CHOICE], dealerCap: minorUnits(5_000_000) };
const mu = (n: number): MinorUnits => minorUnits(n);

function buy(over: Partial<CheckInputs> = {}): CheckInputs {
  return { ...emptyCheckInputs('buy', TODAY), advertised: 1_450_000, method: 'cash', ...over };
}
function adj(over: Partial<AdjustmentLine> = {}): AdjustmentLine {
  return { id: 'a1', name: 'x', amount: 1_000, note: '', counted: true, effect: 'adds', onDay: true, taxPercentText: null, ...over };
}
function ln(over: Partial<InputLine> = {}): InputLine {
  return { id: 'r1', name: 'x', amount: 1_000, note: '', counted: true, seriesId: null, category: null, ...over };
}
function ok(inputs: CheckInputs) {
  const r = toEngineCheck(inputs, CTX);
  if (!r.ok) throw new Error(`expected ok, got missing ${r.missing}`);
  return r;
}

describe('rate text', () => {
  it('IN-C01: typedRateAbove compares typed text as a percent, allowing a trailing point', () => {
    expect(typedRateAbove('1000', '999.99')).toBe(true);
    expect(typedRateAbove('1000.', '999.99')).toBe(true);
    expect(typedRateAbove('999.99', '999.99')).toBe(false);
    expect(typedRateAbove('19.', '999.99')).toBe(false);
    expect(typedRateAbove('', '999.99')).toBe(false);
    expect(typedRateAbove('.', '999.99')).toBe(false);
  });
  it('accepts only the engine percent grammar', () => {
    expect(isValidRateText('9.4')).toBe(true);
    expect(isValidRateText('0')).toBe(true);
    expect(isValidRateText('')).toBe(false);
    expect(isValidRateText('9.')).toBe(false);
    expect(isValidRateText('.5')).toBe(false);
    expect(isValidRateText('10000')).toBe(false);
    expect(isValidRateText('abc')).toBe(false);
  });
  it('bounds a projection rate at the engine maximum and an APR at MAX_APR', () => {
    expect(isValidProjectionRateText('100')).toBe(true);
    expect(isValidProjectionRateText('100.0000000001')).toBe(false);
    expect(isValidProjectionRateText('250')).toBe(false);
    expect(isValidProjectionRateText('x')).toBe(false);
    expect(isValidAprText('999.99')).toBe(true);
    expect(isValidAprText('1000')).toBe(false);
    expect(MAX_APR).toBe(percent('999.99'));
    expect(MAX_INPUT_MINOR).toBe(1_000_000_000_000);
  });
});

describe('emptyCheckInputs', () => {
  it('starts empty with nothing pre-filled', () => {
    const e = emptyCheckInputs('buy', TODAY);
    expect(e).toMatchObject({
      v: 1, kind: 'buy', name: '', source: '', itemType: 'general', itemTypeTouched: false, advertised: null, needBy: null, why: '',
      adjustments: [], runningCosts: [], replaces: [], lossOfValue: null, method: null,
      loan: { deposit: 0, termMonths: 48, aprText: '', secured: false, securedTouched: false, aprFromQuick: false, promo: null, variable: false },
      instalment: { amount: null, count: null, lateFee: null },
      card: { accountId: null, payoff: 'months', months: 12, promo: null, variable: false, fees: null },
      investTermMonths: null, projectionRates: [], investHorizonMonths: null, investHoldingFeeText: null, combine: true, coolingOff: false,
      incomeChange: null, currency: null, cheaperPrice: null, customItemType: null, investReturnText: null, lumpHorizonMonths: null, wait: { monthlyAmount: null }, outcome: null, goAccountId: null,
      investAccountId: null, scope: 'personal', split: null, cardNotes: { incomeStops: null, noNewSpending: null, jobLossCover: null },
    });
    expect(e.setbacks.map((s) => [s.id, s.code, s.enabled, s.amount])).toEqual([
      ['sb-1', 'unexpected_expense', false, null],
      ['sb-2', 'income_drop', false, null],
      ['sb-3', 'job_loss', false, null],
      ['sb-4', 'late_invoice', false, null],
    ]);
    expect(e.setbacks[1]).toMatchObject({ percentDrop: 20, months: 2 });
    expect(e.setbacks[2]).toMatchObject({ months: 8 });
    expect(e.setbacks[3]).toMatchObject({ daysLate: 30 });
    expect(emptyCheckInputs('invest', TODAY).kind).toBe('invest');
  });
  it('quick defaults start on Cash with APR 0 and 12 months', () => {
    expect(defaultQuickInputs()).toEqual({ name: '', price: null, mode: 'cash', aprText: '0', termMonths: 12, taxText: '', fees: null });
  });
});

describe('secured follows the item type', () => {
  it('secured follows the item type until touched', () => {
    expect(securedDefault('vehicle')).toBe(true);
    expect(securedDefault('general')).toBe(false);
    const fresh = emptyCheckInputs('buy', TODAY);
    const car = { ...fresh, ...withItemType(fresh, 'vehicle', false) };
    expect(car.itemType).toBe('vehicle');
    expect(car.loan.secured).toBe(true);
    expect(car.itemTypeTouched).toBe(false);
    const back = { ...car, ...withItemType(car, 'general', true) };
    expect(back.loan.secured).toBe(false);
    expect(back.itemTypeTouched).toBe(true);
    const touched = { ...fresh, loan: { ...fresh.loan, secured: false, securedTouched: true } };
    const patch = withItemType(touched, 'vehicle', true);
    expect(patch.loan?.secured).toBe(false);
    expect(withItemType({ ...fresh, itemTypeTouched: true }, 'tax', false).itemTypeTouched).toBe(true);
  });
  it('the quick carry follows the item type', () => {
    const q = { ...defaultQuickInputs(), name: 'car', price: 1_450_000, mode: 'credit' as const };
    const c = quickToCheckInputs(q, TODAY);
    expect(c.itemType).toBe('vehicle');
    expect(c.loan.secured).toBe(true);
    expect(c.loan.securedTouched).toBe(false);
    expect(c.itemTypeTouched).toBe(false);
  });
});

describe('parseCheckInputs', () => {
  it('returns the empty buy check for anything that is not an object', () => {
    for (const junk of [null, undefined, 3, 'x', [], true]) {
      expect(parseCheckInputs(junk, TODAY)).toEqual(emptyCheckInputs('buy', TODAY));
    }
  });
  it('round-trips a valid check through JSON', () => {
    const full: CheckInputs = buy({
      name: 'Car', source: 'Dealer', itemType: 'vehicle', itemTypeTouched: true, needBy: '2026-12-01', why: 'work', currency: 'USD',
      adjustments: [adj({ id: 'a1', taxPercentText: '6', amount: 87_000 }), adj({ id: 'a2', effect: 'takes_off', counted: false })],
      runningCosts: [ln({ category: 'insurance' })], replaces: [ln({ id: 'p1', seriesId: 's1' })],
      lossOfValue: { kind: 'percent_per_year', percentText: '15' },
      method: 'loan',
      loan: { deposit: 100_000, termMonths: 36, aprText: '9.5', secured: true, securedTouched: true, aprFromQuick: true, promo: { aprText: '0', months: 12, deferredInterest: true }, variable: true },
      instalment: { amount: 5_000, count: 12, lateFee: 500, hasRate: true, aprText: '7.5', firstPayment: 'next_month' },
      card: { accountId: 'acc-card', payoff: 'minimum', months: 24, promo: { aprText: '1.5', months: null, deferredInterest: false }, variable: true, fees: 3_500 },
      investTermMonths: 24, projectionRates: ['4', '6.5', '8'], investHorizonMonths: 120, investHoldingFeeText: '1',
      combine: false, coolingOff: true,
      incomeChange: { direction: 'lowers', amount: 50_000, startDate: '2027-01-01', likelihood: 'uncertain' },
      cheaperPrice: 1_000_000, customItemType: { name: 'Boat', treatLike: 'vehicle' }, investReturnText: '6.5', lumpHorizonMonths: 36,
      wait: { monthlyAmount: 20_000 }, outcome: 'wait', goAccountId: 'g', investAccountId: 'i', scope: 'household',
      split: { kind: 'weight', weights: [1, 2], amounts: [] }, cardNotes: { incomeStops: 'yes', noNewSpending: 'no', jobLossCover: 'unsure' },
    });
    full.setbacks[0] = { ...full.setbacks[0]!, enabled: true, amount: 5_000 };
    expect(parseCheckInputs(JSON.parse(JSON.stringify(full)), TODAY)).toEqual(full);
  });
  it('clamps text, lists and amounts', () => {
    const p = parseCheckInputs(
      {
        kind: 'invest', name: 'n'.repeat(200), source: 's'.repeat(200), why: 'w'.repeat(900), itemType: 'boat', advertised: -5,
        needBy: '2026-02-30', currency: 'usd',
        adjustments: Array.from({ length: 40 }, (_, i) => ({ id: 'dup', amount: 2 ** 60 + i, effect: 'weird', taxPercentText: i === 0 ? '250' : i === 1 ? 'abc' : '5' })),
        runningCosts: [{ id: 'x', amount: 1.5, category: 'nonsense', seriesId: 7 }, 'junk', { id: 'x', counted: false, category: 'fuel', amount: 10 }],
        replaces: 'nope',
        loan: { deposit: -1, termMonths: 601, aprText: '1000', promo: { aprText: 'x', months: 5 } },
        instalment: { amount: 1.2, count: 0, lateFee: -3 },
        card: { payoff: 'sideways', months: 601, fees: 2 ** 60, promo: { aprText: '0', months: 0 } },
        investTermMonths: 700, projectionRates: ['4', '4', '250', 'x', '5', '6', '7'], investHorizonMonths: 0, investHoldingFeeText: '101',
        lossOfValue: { kind: 'percent_per_year', percentText: '101' }, combine: 'yes', coolingOff: 1,
        incomeChange: { direction: 'sideways', amount: 5, startDate: '2026-01-01', likelihood: 'likely' },
        cheaperRatioPercent: 20, wait: { monthlyAmount: -1 }, outcome: 'maybe', goAccountId: 4, scope: 'x', split: { kind: 'bogus' }, cardNotes: { incomeStops: 'maybe' },
      },
      TODAY
    );
    expect(p.kind).toBe('invest');
    expect(p.name).toHaveLength(80);
    expect(p.source).toHaveLength(80);
    expect(p.why).toHaveLength(500);
    expect(p.itemType).toBe('general');
    expect(p.advertised).toBeNull();
    expect(p.needBy).toBeNull();
    expect(p.currency).toBeNull();
    expect(p.adjustments).toHaveLength(30);
    expect(new Set(p.adjustments.map((a) => a.id)).size).toBe(30);
    expect(p.adjustments.every((a) => a.amount === 0 && a.effect === 'adds')).toBe(true);
    expect(p.adjustments[0]!.taxPercentText).toBeNull();
    expect(p.adjustments[1]!.taxPercentText).toBeNull();
    expect(p.adjustments[2]!.taxPercentText).toBe('5');
    expect(p.runningCosts.map((r) => [r.id !== '', r.amount, r.category, r.seriesId])).toEqual([[true, 0, null, null], [true, 0, null, null], [true, 10, 'fuel', null]]);
    expect(new Set(p.runningCosts.map((r) => r.id)).size).toBe(3);
    expect(p.replaces).toEqual([]);
    expect(p.loan).toMatchObject({ deposit: 0, termMonths: null, aprText: '', promo: null });
    expect(p.instalment).toEqual({ amount: null, count: null, lateFee: null, hasRate: false, aprText: '', firstPayment: 'today' });
    expect(p.card).toMatchObject({ payoff: 'months', months: 12, fees: null, promo: null });
    expect(p.investTermMonths).toBeNull();
    expect(p.projectionRates).toEqual(['4', '5', '6']);
    expect(p.investHorizonMonths).toBeNull();
    expect(p.investHoldingFeeText).toBeNull();
    expect(p.lossOfValue).toBeNull();
    expect(p.combine).toBe(true);
    expect(p.coolingOff).toBe(false);
    expect(p.incomeChange).toBeNull();
    expect(p.cheaperPrice).toBeNull();
    expect(p.wait.monthlyAmount).toBeNull();
    expect(p.outcome).toBeNull();
    expect(p.goAccountId).toBeNull();
    expect(p.scope).toBe('personal');
    expect(p.split).toBeNull();
    expect(p.cardNotes.incomeStops).toBeNull();
  });
  it('a missing securedTouched follows the item type; a stored touched value is kept', () => {
    expect(parseCheckInputs({ itemType: 'vehicle', loan: { secured: false } }, TODAY).loan).toMatchObject({ secured: true, securedTouched: false });
    expect(parseCheckInputs({ itemType: 'vehicle', loan: { secured: false, securedTouched: true } }, TODAY).loan.secured).toBe(false);
    expect(parseCheckInputs({}, TODAY).investAccountId).toBeNull();
  });
  it('reads a legacy projectionReturnText as one rate and drops an out-of-range one', () => {
    expect(parseCheckInputs({ projectionReturnText: '6' }, TODAY).projectionRates).toEqual(['6']);
    expect(parseCheckInputs({ projectionReturnText: '250' }, TODAY).projectionRates).toEqual([]);
    expect(parseCheckInputs({ projectionReturnText: '6', projectionRates: ['3'] }, TODAY).projectionRates).toEqual(['3']);
  });
  it('bounds setbacks, money and the income change', () => {
    const p = parseCheckInputs(
      {
        advertised: 2 ** 40,
        setbacks: [
          { code: 'unexpected_expense', enabled: true, amount: 12.5 },
          { code: 'income_drop', enabled: 'x', percentDrop: 101, months: 601 },
          { code: 'job_loss', months: -1 },
          { code: 'late_invoice', daysLate: 366 },
          { code: 'nope' },
          'junk',
        ],
        incomeChange: { direction: 'raises', amount: 0, startDate: 'bad', likelihood: 'uncertain' },
        loan: { termMonths: 12.5, deposit: 1.5 },
        card: { promo: { aprText: '', months: 601 } },
        split: { kind: 'even', weights: [1, -2, 'x', 3], amounts: 'no' },
      },
      TODAY
    );
    expect(p.advertised).toBe(2 ** 40 > MAX_INPUT_MINOR ? null : 2 ** 40);
    expect(p.setbacks.map((s) => s.code)).toEqual(['unexpected_expense', 'income_drop', 'job_loss', 'late_invoice']);
    expect(p.setbacks[0]).toMatchObject({ enabled: true, amount: null });
    expect(p.setbacks[1]).toMatchObject({ enabled: false, percentDrop: 20, months: 2 });
    expect(p.setbacks[2]!.months).toBe(8);
    expect(p.setbacks[3]!.daysLate).toBe(30);
    expect(p.incomeChange).toEqual({ direction: 'raises', amount: null, startDate: null, likelihood: 'uncertain' });
    expect(p.loan).toMatchObject({ termMonths: null, deposit: 0 });
    expect(p.card.promo).toBeNull();
    expect(p.split).toEqual({ kind: 'even', weights: [1, 3], amounts: [] });
    expect(parseCheckInputs({ setbacks: 'x' }, TODAY).setbacks).toHaveLength(4);
    expect(parseCheckInputs({ advertised: 999 }, TODAY).advertised).toBe(999);
  });
  it('keeps a valid promo with no months and a valid income change', () => {
    const p = parseCheckInputs({ loan: { promo: { aprText: '', months: 12 } }, incomeChange: { direction: 'raises', amount: 100, startDate: '2027-02-01', likelihood: 'likely' } }, TODAY);
    expect(p.loan.promo).toEqual({ aprText: '', months: 12, deferredInterest: false });
    expect(parseCheckInputs({ loan: { promo: { months: 5 } } }, TODAY).loan.promo).toEqual({ aprText: '', months: 5, deferredInterest: false });
    expect(p.incomeChange).toEqual({ direction: 'raises', amount: 100, startDate: '2027-02-01', likelihood: 'likely' });
  });
  it('keeps loss of value only as a positive amount or a percent up to 100', () => {
    expect(parseCheckInputs({ lossOfValue: { kind: 'amount', monthly: 25_000 } }, TODAY).lossOfValue).toEqual({ kind: 'amount', monthly: 25_000 });
    expect(parseCheckInputs({ lossOfValue: { kind: 'amount', monthly: 0 } }, TODAY).lossOfValue).toBeNull();
    expect(parseCheckInputs({ lossOfValue: { kind: 'percent_per_year', percentText: '0' } }, TODAY).lossOfValue).toBeNull();
    expect(parseCheckInputs({ lossOfValue: { kind: 'percent_per_year', percentText: '100' } }, TODAY).lossOfValue).toEqual({ kind: 'percent_per_year', percentText: '100' });
    expect(parseCheckInputs({ lossOfValue: { kind: 'mystery' } }, TODAY).lossOfValue).toBeNull();
    expect(parseCheckInputs({ lossOfValue: 5 }, TODAY).lossOfValue).toBeNull();
    expect(parseCheckInputs({ investHoldingFeeText: '1.5' }, TODAY).investHoldingFeeText).toBe('1.5');
  });
  it('a loss-of-value percent above 100 is refused', () => {
    expect(parseCheckInputs({ lossOfValue: { kind: 'percent_per_year', percentText: '101' } }, TODAY).lossOfValue).toBeNull();
  });
  it('never throws for any JSON', () => {
    fc.assert(fc.property(fc.jsonValue(), (j) => { parseCheckInputs(j, TODAY); }), { numRuns: 300 });
  });
});

describe('quickToCheckInputs', () => {
  it('carries every quick field: name, price, mode, APR, term, tax and fees', () => {
    const q = { name: 'sofa', price: 1_450_000, mode: 'credit' as const, aprText: '4.9', termMonths: 36 as const, taxText: '6', fees: 8_000 };
    const c = quickToCheckInputs(q, TODAY);
    expect(c).toMatchObject({ name: 'sofa', advertised: 1_450_000, method: 'loan' });
    expect(c.loan).toMatchObject({ deposit: 0, termMonths: 36, aprText: '4.9', aprFromQuick: true, secured: false, securedTouched: false });
    expect(c.adjustments).toHaveLength(2);
    expect(c.adjustments[0]).toMatchObject({ name: '', effect: 'adds', onDay: true, counted: true, taxPercentText: '6', amount: 87_000 });
    expect(c.adjustments[1]).toMatchObject({ name: '', effect: 'adds', onDay: true, counted: true, taxPercentText: null, amount: 8_000, note: 'fees' });
  });
  it('Cash and a blank APR carry as 0, no tax or fees add no lines', () => {
    const c = quickToCheckInputs({ ...defaultQuickInputs(), name: 'tv', price: 100_000, mode: 'cash', aprText: '' }, TODAY);
    expect(c.method).toBe('cash');
    expect(c.adjustments).toEqual([]);
    expect(c.loan.aprText).toBe('0');
    expect(quickToCheckInputs({ ...defaultQuickInputs(), price: 100, fees: 0, taxText: 'abc' }, TODAY).adjustments).toEqual([]);
    expect(quickToCheckInputs({ ...defaultQuickInputs(), price: 100, taxText: '150' }, TODAY).adjustments).toEqual([]);
    expect(quickToCheckInputs({ ...defaultQuickInputs(), price: null, taxText: '6', fees: 5 }, TODAY).adjustments).toHaveLength(1);
  });
  it('IN-B06: records the currency the quick amounts were judged in, and only a validated price', () => {
    const q = { ...defaultQuickInputs(), name: 'tv', price: 100_000 };
    expect(quickToCheckInputs(q, TODAY, 'GBP').currency).toBe('GBP');
    expect(quickToCheckInputs(q, TODAY).currency).toBeNull();
    expect(quickToCheckInputs({ ...q, price: MAX_INPUT_MINOR + 1 }, TODAY, 'GBP').advertised).toBeNull();
    expect(quickToCheckInputs({ ...q, price: 0 }, TODAY, 'GBP').advertised).toBeNull();
  });
});

describe('R15 inputs (D-80..D-83)', () => {
  it('D-83 cheaperFinalPrice is null with no cheaper price and clamps to [1, plan price]', () => {
    expect(cheaperFinalPrice(buy(), mu(100))).toBeNull();
    expect(cheaperFinalPrice(buy({ cheaperPrice: 500 }), mu(100))).toBe(100);
    expect(cheaperFinalPrice(buy({ cheaperPrice: 50 }), mu(100))).toBe(50);
    expect(cheaperFinalPrice(buy({ cheaperPrice: 50, adjustments: [adj({ effect: 'takes_off', amount: 9_999 })] }), mu(100))).toBe(1);
    expect(cheaperFinalPrice({ ...emptyCheckInputs('invest', TODAY), cheaperPrice: 70, adjustments: [adj()] }, mu(100))).toBe(70);
  });
  it('D-83 cheaperPriceForPercent rounds up to the cent', () => {
    expect(cheaperPriceForPercent(1_000_001, 65)).toBe(650_001);
  });
  it('D-80 an old instalment parses with no rate and first payment today', () => {
    const p = parseCheckInputs({ instalment: { amount: 5_000, count: 12, lateFee: 100 } }, TODAY);
    expect(p.instalment).toEqual({ amount: 5_000, count: 12, lateFee: 100, hasRate: false, aprText: '', firstPayment: 'today' });
    const bad = parseCheckInputs({ instalment: { hasRate: 'yes', aprText: '5000', firstPayment: 'never' } }, TODAY);
    expect(bad.instalment).toMatchObject({ hasRate: false, aprText: '', firstPayment: 'today' });
    const old = ok({ ...buy({ method: 'instalment' }), instalment: { amount: 150_000, count: 12, lateFee: null } }).check as BuyCheck;
    expect('apr' in old.payment).toBe(false);
    expect((old.payment as { firstPayment: string }).firstPayment).toBe('today');
  });
  it('D-80 a rate is mapped to apr; a blank rate is instalment_rate_missing', () => {
    const base = emptyCheckInputs('buy', TODAY).instalment;
    const rated = ok(buy({ method: 'instalment', instalment: { ...base, amount: 150_000, count: 12, hasRate: true, aprText: '7.5', firstPayment: 'next_month' } })).check as BuyCheck;
    expect(rated.payment).toMatchObject({ apr: percent('7.5'), firstPayment: 'next_month', instalmentAmount: 150_000 });
    const blank = ok(buy({ method: 'instalment', instalment: { ...base, amount: 150_000, count: 12, hasRate: true } })).check as BuyCheck;
    expect((blank.payment as { apr: unknown }).apr).toBeNull();
    const invalid = ok(buy({ method: 'instalment', instalment: { ...base, count: 12, hasRate: true, aprText: '5000' } })).check as BuyCheck;
    expect(invalid.payment).toMatchObject({ apr: null, instalmentAmount: null });
    expect(resolvePlan(blank)).toMatchObject({ status: 'missing' });
    expect(resolvePlan(ok(buy({ method: 'instalment', instalment: { ...base, count: 12, hasRate: true } })).check as BuyCheck)).toMatchObject({ status: 'missing', reasons: ['instalment_rate_missing'] });
    // switching back to No keeps the typed rate text but sends no apr
    const kept = ok(buy({ method: 'instalment', instalment: { ...base, amount: 150_000, count: 12, hasRate: false, aprText: '7.5' } })).check as BuyCheck;
    expect('apr' in kept.payment).toBe(false);
  });
  it('D-83 an old cheaper percent converts to ceil(advertised x percent / 100)', () => {
    expect(parseCheckInputs({ advertised: 1_000_001, cheaperRatioPercent: 65 }, TODAY).cheaperPrice).toBe(650_001);
    expect(parseCheckInputs({ advertised: 1_000_000, cheaperRatioPercent: 65 }, TODAY).cheaperPrice).toBe(650_000);
    expect(parseCheckInputs({ advertised: 1_000_000, cheaperRatioPercent: 20 }, TODAY).cheaperPrice).toBeNull();
    expect(parseCheckInputs({ cheaperRatioPercent: 65 }, TODAY).cheaperPrice).toBeNull();
    expect(parseCheckInputs({ advertised: 1_000_000, cheaperPrice: 500_000, cheaperRatioPercent: 65 }, TODAY).cheaperPrice).toBe(500_000);
    expect(parseCheckInputs({ advertised: 1_000_000, cheaperPrice: 299_999 }, TODAY).cheaperPrice).toBeNull();
    expect(parseCheckInputs({ advertised: 1_000_000, cheaperPrice: 1_000_001 }, TODAY).cheaperPrice).toBeNull();
    expect(parseCheckInputs({ advertised: 1_000_000, cheaperPrice: 300_000 }, TODAY).cheaperPrice).toBe(300_000);
    expect(parseCheckInputs({ advertised: 1_000_000, cheaperPrice: 650_000.5 }, TODAY).cheaperPrice).toBeNull();
  });
  it('D-81 a custom item type sets the rules type and keeps the name out of the engine', () => {
    const p = parseCheckInputs({ itemType: 'tax', customItemType: { name: '  Boat  ', treatLike: 'vehicle' } }, TODAY);
    expect(p.customItemType).toEqual({ name: 'Boat', treatLike: 'vehicle' });
    expect(p.itemType).toBe('vehicle');
    expect(p.loan.secured).toBe(true);
    const none = parseCheckInputs({ itemType: 'tax', customItemType: { name: 'Kayak', treatLike: null } }, TODAY);
    expect(none.customItemType).toEqual({ name: 'Kayak', treatLike: null });
    expect(none.itemType).toBe('general');
    const missing = parseCheckInputs({ customItemType: { name: 'Kayak' } }, TODAY);
    expect(missing.customItemType).toEqual({ name: 'Kayak', treatLike: null });
    const r = ok({ ...none, advertised: 1_450_000, method: 'cash' });
    expect(JSON.stringify(r.check)).not.toContain('Kayak');
    expect((r.check as BuyCheck).itemType).toBe('general');
  });
  it('D-81 an invalid custom item type is dropped', () => {
    for (const bad of [null, 'x', { name: '' }, { name: '   ' }, { name: 5 }, { name: 'n'.repeat(41) }, { name: 'Boat', treatLike: 'spaceship' }]) {
      const p = parseCheckInputs({ itemType: 'vehicle', customItemType: bad }, TODAY);
      expect(p.customItemType).toBeNull();
      expect(p.itemType).toBe('vehicle');
    }
    expect(parseCheckInputs({ customItemType: { name: 'n'.repeat(40) } }, TODAY).customItemType?.name).toHaveLength(40);
  });
  it('D-82 an expected return outside 0-100 is dropped', () => {
    expect(parseCheckInputs({ investReturnText: '7.5' }, TODAY).investReturnText).toBe('7.5');
    expect(parseCheckInputs({ investReturnText: '0' }, TODAY).investReturnText).toBe('0');
    expect(parseCheckInputs({ investReturnText: '100' }, TODAY).investReturnText).toBe('100');
    for (const bad of ['101', '250', 'x', '', 7, null]) expect(parseCheckInputs({ investReturnText: bad }, TODAY).investReturnText).toBeNull();
    expect(parseCheckInputs({ lumpHorizonMonths: 36 }, TODAY).lumpHorizonMonths).toBe(36);
    expect(parseCheckInputs({ lumpHorizonMonths: 0 }, TODAY).lumpHorizonMonths).toBeNull();
  });
});

describe('toEngineCheck', () => {
  it('reports what is missing', () => {
    expect(toEngineCheck(buy({ advertised: null }), CTX)).toEqual({ ok: false, missing: 'price' });
    expect(toEngineCheck(buy({ advertised: 0 }), CTX)).toEqual({ ok: false, missing: 'price' });
    expect(toEngineCheck(buy({ advertised: MAX_INPUT_MINOR + 1 }), CTX)).toEqual({ ok: false, missing: 'price' });
    expect(toEngineCheck(buy({ method: null }), CTX)).toEqual({ ok: false, missing: 'method' });
    expect(toEngineCheck(buy({ method: 'lump' }), CTX)).toEqual({ ok: false, missing: 'method' });
    expect(effectiveMethod(buy({ method: 'lump' }))).toBeNull();
    expect(effectiveMethod(buy({ method: 'card' }))).toBe('card');
    expect(effectiveMethod(emptyCheckInputs('invest', TODAY))).toBe('lump');
    expect(effectiveMethod({ ...emptyCheckInputs('invest', TODAY), method: 'monthly' })).toBe('monthly');
  });
  it('adds sales tax and fees to the day-one price (04-06 value)', () => {
    const r = ok(buy({ adjustments: [adj({ id: 't', taxPercentText: 'tax', amount: 0 }), adj({ id: 'f', amount: 8_000 })] }));
    expect(r.resolvedPrice.price).toBe(1_458_000);
    const tax = ok(buy({ adjustments: [adj({ id: 't', taxPercentText: '6', amount: 0 }), adj({ id: 'f', amount: 8_000 })] }));
    expect(salesTaxAmount(mu(1_450_000), percent('6'))).toBe(87_000);
    expect(tax.resolvedPrice.price).toBe(1_545_000);
    expect(tax.resolvedPrice.dayFees).toBe(95_000);
    expect((tax.check as BuyCheck).price).toBe(1_545_000);
    expect((tax.check as BuyCheck).dayFees).toBe(95_000);
  });
  it('maps cash, loan, instalment and card payments', () => {
    expect((ok(buy()).check as BuyCheck).payment).toEqual({ method: 'cash' });
    const loan = ok(buy({ method: 'loan', loan: { ...emptyCheckInputs('buy', TODAY).loan, deposit: 9_999_999, termMonths: 24, aprText: '9.5' } })).check as BuyCheck;
    expect(loan.payment).toEqual({ method: 'loan', deposit: 1_450_000, termMonths: 24, apr: percent('9.5') });
    const noRate = ok(buy({ method: 'loan' })).check as BuyCheck;
    expect(noRate.payment).toMatchObject({ apr: null, termMonths: 48 });
    const zero = ok(buy({ method: 'loan', loan: { ...emptyCheckInputs('buy', TODAY).loan, aprText: '0' } })).check as BuyCheck;
    expect((zero.payment as { apr: unknown }).apr).toBe(ZERO_PERCENT);
    const huge = ok(buy({ method: 'loan', loan: { ...emptyCheckInputs('buy', TODAY).loan, aprText: '5000' } })).check as BuyCheck;
    expect((huge.payment as { apr: unknown }).apr).toBeNull();
    const inst = ok(buy({ method: 'instalment', instalment: { amount: 150_000, count: 12, lateFee: 0 } })).check as BuyCheck;
    expect(inst.payment).toEqual({ method: 'instalment', instalmentAmount: 150_000, instalmentCount: 12, firstPayment: 'today' });
    const late = ok(buy({ method: 'instalment', instalment: { amount: 150_000, count: 12, lateFee: 500 } })).check as BuyCheck;
    expect(late.payment).toMatchObject({ lateFee: 500 });
    expect(JSON.stringify(late.payment)).not.toContain('lateFeeCap');
  });
  it('maps the card, its payoff and the dealer cap', () => {
    const base = emptyCheckInputs('buy', TODAY).card;
    const none = ok(buy({ method: 'card' })).check as BuyCheck;
    expect(none.payment).toMatchObject({ method: 'card', card: null, payoff: { kind: 'months', months: 12 }, dealerCap: 5_000_000 });
    const full = ok(buy({ method: 'card', card: { ...base, accountId: 'acc-card', payoff: 'full' } })).check as BuyCheck;
    expect(full.payment).toMatchObject({ card: CARD_CHOICE.record, payoff: { kind: 'full' } });
    const min = ok(buy({ method: 'card', card: { ...base, accountId: 'acc-card', payoff: 'minimum' } })).check as BuyCheck;
    expect(min.payment).toMatchObject({ payoff: { kind: 'minimum' } });
    const unknown = ok(buy({ method: 'card', card: { ...base, accountId: 'other' } })).check as BuyCheck;
    expect((unknown.payment as { card: unknown }).card).toBeNull();
  });
  it('card fees reach the card plan', () => {
    const base = emptyCheckInputs('buy', TODAY).card;
    const withFees = ok(buy({ method: 'card', card: { ...base, accountId: 'acc-card', payoff: 'months', months: 12, fees: 3_500 } })).check as BuyCheck;
    expect(withFees.payment).toMatchObject({ cardFees: 3_500 });
    const plan = resolvePlan(withFees);
    expect(plan.status === 'resolved' && plan.plan.card?.fees).toBe(3_500);
    const noFees = ok(buy({ method: 'card', card: { ...base, accountId: 'acc-card', payoff: 'months', months: 12, fees: null } })).check as BuyCheck;
    expect('cardFees' in noFees.payment).toBe(false);
    const zero = ok(buy({ method: 'card', card: { ...base, accountId: 'acc-card', fees: 0 } })).check as BuyCheck;
    expect('cardFees' in zero.payment).toBe(false);
  });
  it('maps invest lump and monthly', () => {
    const inv = { ...emptyCheckInputs('invest', TODAY), advertised: 500_000 };
    expect(ok(inv).check).toEqual({ kind: 'invest', currency: USD, amount: 500_000, payment: { method: 'lump' } });
    expect(ok({ ...inv, method: 'monthly', investTermMonths: 24 }).check).toEqual({ kind: 'invest', currency: USD, amount: 500_000, payment: { method: 'monthly', termMonths: 24 } });
    expect(ok(inv).running.net).toBe(0);
  });
  it('deferred interest is sent only when toggled on at 0%', () => {
    const loanWith = (aprText: string, deferredInterest: boolean) =>
      (ok(buy({ method: 'loan', loan: { ...emptyCheckInputs('buy', TODAY).loan, aprText: '9.9', promo: { aprText, months: 12, deferredInterest } } })).check as BuyCheck).payment as { promo?: { apr: bigint; months: number; deferredInterest: boolean } };
    expect(loanWith('0', true).promo).toEqual({ apr: ZERO_PERCENT, months: 12, deferredInterest: true });
    expect(loanWith('3.9', true).promo?.deferredInterest).toBe(false);
    expect(loanWith('0', false).promo?.deferredInterest).toBe(false);
    const noMonths = ok(buy({ method: 'loan', loan: { ...emptyCheckInputs('buy', TODAY).loan, aprText: '9.9', promo: { aprText: '0', months: null, deferredInterest: true } } })).check as BuyCheck;
    expect('promo' in noMonths.payment).toBe(false);
    const badRate = ok(buy({ method: 'loan', loan: { ...emptyCheckInputs('buy', TODAY).loan, aprText: '9.9', promo: { aprText: '', months: 6, deferredInterest: false } } })).check as BuyCheck;
    expect('promo' in badRate.payment).toBe(false);
  });
  it('sends a variable flag and a card promotion only when typed', () => {
    const base = emptyCheckInputs('buy', TODAY);
    const v = ok(buy({ method: 'loan', loan: { ...base.loan, aprText: '9', variable: true } })).check as BuyCheck;
    expect(v.payment).toMatchObject({ variable: true });
    const plain = ok(buy({ method: 'loan', loan: { ...base.loan, aprText: '9' } })).check as BuyCheck;
    expect('variable' in plain.payment).toBe(false);
    const card = ok(buy({ method: 'card', card: { ...base.card, accountId: 'acc-card', variable: true, promo: { aprText: '0', months: 6, deferredInterest: true } } })).check as BuyCheck;
    expect(card.payment).toMatchObject({ variable: true, promo: { apr: ZERO_PERCENT, months: 6, deferredInterest: true } });
  });
  it('sends an income change only when an amount and a start date are typed', () => {
    const lowers = ok(buy({ incomeChange: { direction: 'lowers', amount: 50_000, startDate: '2027-01-01', likelihood: 'likely' } })).check as BuyCheck;
    expect(lowers.incomeChange).toEqual({ monthlyAmount: -50_000, startDate: '2027-01-01', likelihood: 'likely' });
    const raises = ok(buy({ incomeChange: { direction: 'raises', amount: 50_000, startDate: '2027-01-01', likelihood: 'uncertain' } })).check as BuyCheck;
    expect(raises.incomeChange?.monthlyAmount).toBe(50_000);
    for (const ic of [{ direction: 'raises' as const, amount: null, startDate: '2027-01-01', likelihood: 'likely' as const }, { direction: 'raises' as const, amount: 5, startDate: null, likelihood: 'likely' as const }, null]) {
      expect('incomeChange' in (ok(buy({ incomeChange: ic })).check as BuyCheck)).toBe(false);
    }
  });
  it('running costs net against replaced expenses and prompt rows at 0 are not counted', () => {
    const r = ok(buy({ runningCosts: [ln({ amount: 30_000 }), ln({ id: 'r2', amount: 0, category: 'insurance' }), ln({ id: 'r3', amount: 5_000, counted: false })], replaces: [ln({ id: 'p1', amount: 10_000 })] }));
    expect(r.running.gross).toBe(30_000);
    expect(r.running.countedCosts).toBe(1);
    expect(r.running.net).toBe(20_000);
    expect((r.check as BuyCheck).runningCostsNet).toBe(20_000);
  });
  it('loss of value is shown, never counted in the month', () => {
    const none = ok(buy({ lossOfValue: null }));
    const pct = ok(buy({ lossOfValue: { kind: 'percent_per_year', percentText: '15' } }));
    expect(pct.running.nonCash).toBe(18_125);
    expect(pct.running.net).toBe(none.running.net);
    expect((pct.check as BuyCheck).runningCostsNet).toBe((none.check as BuyCheck).runningCostsNet);
    const amount = ok(buy({ lossOfValue: { kind: 'amount', monthly: 25_000 } }));
    expect(amount.running.nonCash).toBe(25_000);
    expect(amount.running.net).toBe(0);
    expect(ok(buy({ lossOfValue: { kind: 'percent_per_year', percentText: 'zz' } })).running.nonCash).toBe(0);
    expect(ok(buy({ lossOfValue: { kind: 'percent_per_year', percentText: '150' } })).running.nonCash).toBe(0);
  });
  it('a loss-of-value percent is of the advertised price', () => {
    const r = ok(buy({ adjustments: [adj({ id: 'trade', name: 'Trade-in', amount: 65_000, effect: 'takes_off', onDay: false })], lossOfValue: { kind: 'percent_per_year', percentText: '10' } }));
    expect(r.resolvedPrice.price).toBe(1_385_000);
    expect(r.running.nonCash).toBe(12_083);
  });
  it('CR-C02: one recurring bill replaced twice is subtracted once', () => {
    const r = ok(buy({ replaces: [ln({ id: 'p1', amount: 10_000, seriesId: 's1' }), ln({ id: 'p2', amount: 10_000, seriesId: 's1' }), ln({ id: 'p3', amount: 2_000 })] }));
    expect(r.running.replaced).toBe(12_000);
    expect(uniqueReplaces([ln({ id: 'a', seriesId: 's1', counted: false }), ln({ id: 'b', seriesId: 's1' }), ln({ id: 'c', seriesId: 's1' })]).map((l) => l.id)).toEqual(['a', 'b']);
  });
  it('a legacy loss_of_value running-cost line is dropped', () => {
    const r = ok(buy({ runningCosts: [ln({ id: 'l1', amount: 9_999, category: 'loss_of_value' }), ln({ id: 'r2', amount: 1_000 })], replaces: [ln({ id: 'p9', amount: 7_000, category: 'loss_of_value' })] }));
    expect(r.running.nonCash).toBe(0);
    expect(r.running.gross).toBe(1_000);
    expect(r.running.replaced).toBe(0);
  });
});

describe('finalPriceOf', () => {
  it('WR-B07: is the price after tax, fees and trade-ins; null with no price', () => {
    expect(finalPriceOf({ advertised: null, adjustments: [] })).toBeNull();
    const adjustments = [adj({ id: 'tax', taxPercentText: '10', amount: 0 }), adj({ id: 'fee', amount: 5_000 }), adj({ id: 'trade', effect: 'takes_off', amount: 20_000 }), adj({ id: 'off', counted: false, amount: 99_999 })];
    expect(finalPriceOf({ advertised: mu(100_000), adjustments })).toBe(95_000);
  });
});

describe('repriceInputs', () => {
  function reprice(inputs: CheckInputs, finalPrice: number, opts: { cheaperPrice?: number } = {}) {
    const r = ok(inputs);
    return { r, patch: repriceInputs(inputs, r.check as BuyCheck, r.resolvedPrice, mu(finalPrice), opts) };
  }
  it('use this price scales the instalments like the engine', () => {
    const inputs = buy({ advertised: 180_000, method: 'instalment', instalment: { amount: 15_000, count: 12, lateFee: null } });
    const { r, patch } = reprice(inputs, 120_000);
    expect(patch).not.toBeNull();
    expect(patch!.advertised).toBe(120_000);
    expect(patch!.instalment!.amount).toBe(10_000);
    const again = ok({ ...inputs, ...patch });
    expect(again.check).toEqual(withPrice(r.check, mu(120_000)));
  });
  it('the cheaper price scales the deposit like the cheaper row', () => {
    const inputs = buy({ advertised: 1_000_000, method: 'loan', loan: { ...emptyCheckInputs('buy', TODAY).loan, deposit: 100_001, aprText: '5' } });
    const keep = reprice(inputs, 800_000).patch!;
    expect(keep.loan).toBeUndefined();
    const { patch } = reprice(inputs, 650_000, { cheaperPrice: 650_000 });
    expect(patch!.loan!.deposit).toBe(65_001); // 100_001 x 65 / 100 = 65_000.65, half-up
    expect(patch!.advertised).toBe(650_000);
  });
  it('D-83 Use the cheaper price writes advertised = cheaperPrice exactly', () => {
    const inputs = buy({ advertised: 1_000_000, adjustments: [adj({ id: 't', taxPercentText: '10', amount: 100_000 }), adj({ id: 'f', amount: 7_000 })] });
    const { patch } = reprice(inputs, 0, { cheaperPrice: 612_345 });
    expect(patch!.advertised).toBe(612_345);
    expect(patch!.adjustments![0]!.amount).toBe(61_235);
    expect(patch!.adjustments![1]).toEqual(inputs.adjustments[1]);
    expect(reprice(inputs, 0, { cheaperPrice: 0 }).patch).toBeNull();
    expect(reprice(inputs, 0, { cheaperPrice: 1.5 }).patch).toBeNull();
    expect(reprice(inputs, 0, { cheaperPrice: MAX_INPUT_MINOR + 1 }).patch).toBeNull();
    const plain = reprice(buy({ advertised: 1_000_000 }), 0, { cheaperPrice: 300_000 }).patch!;
    expect(plain.adjustments).toBeUndefined();
    expect(plain.loan).toBeUndefined();
    expect(plain.instalment).toBeUndefined();
  });
  it('D-83 a loan deposit scales half up by cheaper over advertised', () => {
    const inputs = buy({ advertised: 1_000_000, method: 'loan', loan: { ...emptyCheckInputs('buy', TODAY).loan, deposit: 100_001, aprText: '5' } });
    expect(reprice(inputs, 0, { cheaperPrice: 650_000 }).patch!.loan!.deposit).toBe(65_001);
    expect(reprice(inputs, 0, { cheaperPrice: 300_000 }).patch!.loan!.deposit).toBe(30_000);
  });
  it('D-83 an instalment amount follows the cheaper price; a worked-out payment gets no amount', () => {
    const inputs = buy({ advertised: 180_000, method: 'instalment', instalment: { amount: 15_000, count: 12, lateFee: null } });
    expect(reprice(inputs, 0, { cheaperPrice: 120_000 }).patch!.instalment!.amount).toBe(10_000);
    const worked = buy({ advertised: 180_000, method: 'instalment', instalment: { amount: null, count: 12, lateFee: null, hasRate: true, aprText: '5' } });
    expect(reprice(worked, 0, { cheaperPrice: 120_000 }).patch!.instalment!.amount).toBeNull();
  });
  it('D-83 a zero-price loan check leaves the deposit alone on an exact reprice', () => {
    const base = buy({ advertised: 1_000_000, method: 'loan', loan: { ...emptyCheckInputs('buy', TODAY).loan, deposit: 100, aprText: '5' } });
    const r = ok(base);
    const zero = { ...(r.check as BuyCheck), price: mu(0) };
    expect(repriceInputs(base, zero, r.resolvedPrice, mu(0), { cheaperPrice: 500_000 })!.loan).toBeUndefined();
  });
  it('a 6% sales tax line does not drift the re-price', () => {
    const inputs = buy({ advertised: 1_500_000, adjustments: [adj({ id: 'tax', taxPercentText: '6', amount: 90_000 })] });
    const exact = reprice(inputs, 1_060_000);
    expect(exact.patch!.advertised).toBe(1_000_000);
    expect(ok({ ...inputs, ...exact.patch }).resolvedPrice.price).toBe(1_060_000);
    expect(exact.patch!.adjustments![0]!.amount).toBe(60_000);
    const odd = reprice(inputs, 1_060_005);
    const a = odd.patch!.advertised!;
    expect(ok({ ...inputs, ...odd.patch }).resolvedPrice.price).toBeLessThanOrEqual(1_060_005);
    expect(ok({ ...inputs, advertised: a + 1 }).resolvedPrice.price).toBeGreaterThan(1_060_005);
  });
  it('subtracts a fixed line, handles a takes-off tax line, and is null when nothing fits', () => {
    const fee = buy({ advertised: 500_000, adjustments: [adj({ id: 'f', amount: 8_000 })] });
    expect(reprice(fee, 300_000).patch!.advertised).toBe(292_000);
    expect(reprice(fee, 300_000).patch!.adjustments).toBeUndefined();
    expect(reprice(fee, 8_000).patch).toBeNull();
    expect(reprice(fee, 5_000).patch).toBeNull();
    const off = buy({ advertised: 500_000, adjustments: [adj({ id: 't', taxPercentText: '10', effect: 'takes_off' })] });
    expect(reprice(off, 90_000).patch!.advertised).toBe(100_000);
    const all = buy({ advertised: 500_000, adjustments: [adj({ id: 't', taxPercentText: '100', effect: 'takes_off' })] });
    expect(reprice(all, 90_000).patch).toBeNull();
    const uncounted = buy({ advertised: 500_000, adjustments: [adj({ id: 'u', counted: false })] });
    expect(reprice(uncounted, 400_000).patch!.advertised).toBe(400_000);
    expect(reprice(buy({ advertised: 500_000, method: 'cash' }), 0).patch).toBeNull();
    const mixed = buy({ advertised: 500_000, adjustments: [adj({ id: 'f', amount: 5_000 }), adj({ id: 't', taxPercentText: '10', amount: 50_000 })] });
    const m = ok(mixed);
    const patch = repriceInputs(mixed, m.check as BuyCheck, m.resolvedPrice, mu(400_000));
    expect(patch!.adjustments![0]).toEqual(mixed.adjustments[0]);
    expect(ok({ ...mixed, ...patch }).resolvedPrice.price).toBeLessThanOrEqual(400_000);
  });
});

describe('credit terms are only ever typed', () => {
  it('no optional credit term is ever pre-filled', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.constantFrom('cash', 'loan', 'instalment', 'card'), (json, method) => {
        const parsed = parseCheckInputs(json, TODAY);
        const r = toEngineCheck({ ...parsed, advertised: 100_000, method: method as CheckInputs['method'] }, CTX);
        if (!r.ok) return;
        const pay = JSON.stringify((r.check as BuyCheck).payment);
        const check = JSON.stringify(r.check);
        if (parsed.loan.promo === null && method === 'loan') expect(pay).not.toContain('promo');
        if (parsed.card.promo === null && method === 'card') expect(pay).not.toContain('promo');
        if (!parsed.loan.variable && method === 'loan') expect(pay).not.toContain('variable');
        if (!parsed.card.variable && method === 'card') expect(pay).not.toContain('variable');
        if (!(parsed.instalment.lateFee && parsed.instalment.lateFee > 0)) expect(check).not.toContain('lateFee');
        expect(check).not.toContain('lateFeeCapTotal');
        if (!parsed.card.fees) expect(check).not.toContain('cardFees');
        if (parsed.incomeChange === null || !parsed.incomeChange.amount || !parsed.incomeChange.startDate) expect(check).not.toContain('incomeChange');
        if (parsed.lossOfValue === null) expect(r.running.nonCash).toBe(0);
      }),
      { numRuns: 200 }
    );
    // the deferred toggle is never inferred
    const withPromo = ok(buy({ method: 'loan', loan: { ...emptyCheckInputs('buy', TODAY).loan, aprText: '9', promo: { aprText: '0', months: 6, deferredInterest: false } } })).check as BuyCheck;
    expect((withPromo.payment as { promo: { deferredInterest: boolean } }).promo.deferredInterest).toBe(false);
  });
});
