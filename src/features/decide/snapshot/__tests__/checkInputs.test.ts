import * as fc from 'fast-check';
import { minorUnits, type MinorUnits } from '@/engine/money';
import { percent } from '@/engine/payoff';
import {
  MAX_APR,
  MAX_INPUT_MINOR,
  defaultQuickInputs,
  cheaperPriceForPercent,
  emptyCheckInputs,
  isValidAprText,
  isValidProjectionRateText,
  isValidRateText,
  finalPriceOf,
  parseCheckInputs,
  quickToCheckInputs,
  securedDefault,
  typedRateAbove,
} from '../checkInputs';
import type { AdjustmentLine, CheckInputs, InputLine } from '../types';
import { TODAY } from './helpers/snapshotFixtures';

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
  it('secured follows the item type', () => {
    expect(securedDefault('vehicle')).toBe(true);
    expect(securedDefault('general')).toBe(false);
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
      instalment: { amount: 5_000, count: 12, lateFee: 500, hasRate: true, aprText: '7.5', firstPayment: 'next_period', freq: 'weekly' },
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
    expect(p.instalment).toEqual({ amount: null, count: null, lateFee: null, hasRate: false, aprText: '', firstPayment: 'today', freq: 'monthly' });
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
  it('D-83 cheaperPriceForPercent rounds up to the cent', () => {
    expect(cheaperPriceForPercent(1_000_001, 65)).toBe(650_001);
  });
  it('D-80 an old instalment parses with no rate and first payment today', () => {
    const p = parseCheckInputs({ instalment: { amount: 5_000, count: 12, lateFee: 100 } }, TODAY);
    expect(p.instalment).toEqual({ amount: 5_000, count: 12, lateFee: 100, hasRate: false, aprText: '', firstPayment: 'today', freq: 'monthly' });
    const bad = parseCheckInputs({ instalment: { hasRate: 'yes', aprText: '5000', firstPayment: 'never' } }, TODAY);
    expect(bad.instalment).toMatchObject({ hasRate: false, aprText: '', firstPayment: 'today' });
  });
  it('D-89 an old instalment parses as monthly', () => {
    const p = parseCheckInputs({ instalment: { amount: 5_000, count: 12, lateFee: 100 } }, TODAY);
    expect(p.instalment.freq).toBe('monthly');
    expect(parseCheckInputs({ instalment: { freq: 'daily' } }, TODAY).instalment.freq).toBe('monthly');
    expect(parseCheckInputs({ instalment: { freq: 'quarterly' } }, TODAY).instalment.freq).toBe('quarterly');
    // a stored count above the new input bound of 500 is kept and scored as stored; 601 is not a count
    expect(parseCheckInputs({ instalment: { count: 550 } }, TODAY).instalment.count).toBe(550);
    expect(parseCheckInputs({ instalment: { count: 601 } }, TODAY).instalment.count).toBeNull();
  });

  it('D-89 a stored next_month still reads as next_period', () => {
    expect(parseCheckInputs({ instalment: { firstPayment: 'next_month' } }, TODAY).instalment.firstPayment).toBe('next_period');
    expect(parseCheckInputs({ instalment: { firstPayment: 'next_period' } }, TODAY).instalment.firstPayment).toBe('next_period');
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

describe('finalPriceOf', () => {
  it('WR-B07: is the price after tax, fees and trade-ins; null with no price', () => {
    expect(finalPriceOf({ advertised: null, adjustments: [] })).toBeNull();
    const adjustments = [adj({ id: 'tax', taxPercentText: '10', amount: 0 }), adj({ id: 'fee', amount: 5_000 }), adj({ id: 'trade', effect: 'takes_off', amount: 20_000 }), adj({ id: 'off', counted: false, amount: 99_999 })];
    expect(finalPriceOf({ advertised: mu(100_000), adjustments })).toBe(95_000);
  });
});
