import type { CustomCurrencyRow, FxLatestRow } from '@/db/rows';
import { crossRate, EUR_PER_EUR, formatRate, minorUnits, parseRate } from '@/engine/money';
import { projectionHomeAmount } from '../homeAmount';
import { basisRateText, convertLatest, displayRate, earlierDate, resolvePerEur } from '../fxConvert';

const rates: FxLatestRow[] = [
  { quote: 'USD', rate: '1.0800000000', rate_date: '2026-10-14', source: 'frankfurter-v2' },
  { quote: 'GBP', rate: '0.8600000000', rate_date: '2026-10-12', source: 'frankfurter-v2' },
];

function custom(code: string, ref: string, unit: string, asOf = '2026-10-13', decimals = 2): CustomCurrencyRow {
  return {
    id: `c-${code}`,
    owner_id: 'u',
    code,
    symbol: code[0] ?? 'x',
    decimals,
    reference_currency: ref,
    unit_value: unit,
    as_of: asOf,
    version: 1,
    created_at: '2026-10-13T00:00:00.000Z',
    updated_at: '2026-10-13T00:00:00.000Z',
  };
}

const TOK = custom('TOK', 'USD', '0.5000000000');

describe('resolvePerEur', () => {
  it('EUR resolves to EUR_PER_EUR dated onDate', () => {
    expect(resolvePerEur('EUR', rates, [], '2026-10-15')).toEqual({
      rate: EUR_PER_EUR,
      rateDate: '2026-10-15',
      source: null,
    });
  });
  it('a cached ISO quote gives its parsed rate and date', () => {
    const r = resolvePerEur('USD', rates, [], '2026-10-15');
    expect(r?.rate).toBe(parseRate('1.08'));
    expect(r?.rateDate).toBe('2026-10-14');
    expect(r?.source).toBe('frankfurter-v2');
  });
  it('a custom currency resolves through its reference with the raw custom leg and earlier date', () => {
    const r = resolvePerEur('TOK', rates, [TOK], '2026-10-15');
    expect(r?.rateDate).toBe('2026-10-13');
    expect(r?.source).toBe('custom');
    expect(r?.custom).toEqual({ unitValue: parseRate('0.5'), referencePerEur: parseRate('1.08') });
  });
  it('a reference cycle gives null', () => {
    const a = custom('AAA', 'BBB', '1');
    const b = custom('BBB', 'AAA', '1');
    expect(resolvePerEur('AAA', rates, [a, b], '2026-10-15')).toBeNull();
  });
  it('a rate rounding to 0 gives null', () => {
    const huge = custom('HUG', 'USD', '99999999999999.0000000000');
    expect(resolvePerEur('HUG', rates, [huge], '2026-10-15')).toBeNull();
  });
  it('a missing quote gives null', () => {
    expect(resolvePerEur('JPY', rates, [], '2026-10-15')).toBeNull();
    expect(resolvePerEur('XXX', rates, [custom('XXX', 'JPY', '1')], '2026-10-15')).toBeNull();
  });
});

describe('earlierDate', () => {
  it('empty never wins, otherwise the lesser', () => {
    expect(earlierDate('', '2026-10-14')).toBe('2026-10-14');
    expect(earlierDate('2026-10-14', '')).toBe('2026-10-14');
    expect(earlierDate('2026-10-12', '2026-10-14')).toBe('2026-10-12');
    expect(earlierDate('2026-10-14', '2026-10-12')).toBe('2026-10-12');
  });
});

describe('convertLatest', () => {
  it('same currency returns the amount unchanged', () => {
    expect(convertLatest(1234, 'USD', 'USD', [], [], '2026-10-15')).toEqual({
      amount: 1234,
      fromPerEur: EUR_PER_EUR,
      toPerEur: EUR_PER_EUR,
      rateDate: '2026-10-15',
    });
  });
  it('ISO to ISO matches projectionHomeAmount', () => {
    const r = convertLatest(10000, 'USD', 'GBP', rates, [], '2026-10-15');
    expect(r?.amount).toBe(
      projectionHomeAmount(10000, 'USD', 'GBP', rates)
    );
    expect(r?.rateDate).toBe('2026-10-12');
    expect(r?.fromPerEur).toBe(parseRate('1.08'));
    expect(r?.toPerEur).toBe(parseRate('0.86'));
  });
  it('a custom leg converts through the raw stamp', () => {
    // 1 TOK = 0.5 USD; 100.00 TOK = 50.00 USD
    const r = convertLatest(10000, 'TOK', 'USD', rates, [TOK], '2026-10-15');
    expect(r?.amount).toBe(5000);
  });
  it('a missing rate gives null', () => {
    expect(convertLatest(100, 'JPY', 'USD', rates, [], '2026-10-15')).toBeNull();
    expect(convertLatest(100, 'USD', 'JPY', rates, [], '2026-10-15')).toBeNull();
  });
  it('overflow or unusable exponent gives null, never throws', () => {
    const bad = custom('BAD', 'USD', '1', '2026-10-13', 9);
    expect(convertLatest(100, 'BAD', 'USD', rates, [bad], '2026-10-15')).toBeNull();
    expect(convertLatest(Number.MAX_SAFE_INTEGER, 'TOK', 'USD', rates, [custom('TOK', 'USD', '99999.0')], '2026-10-15')).toBeNull();
  });
});

describe('basisRateText', () => {
  it('is the formatted cross rate', () => {
    const a = parseRate('1.08');
    const b = parseRate('0.86');
    expect(basisRateText(a, b)).toBe(formatRate(crossRate(a, b)));
  });
});

describe('displayRate', () => {
  it('rounds half-up to 2 dp at or above 1 and 4 dp below', () => {
    expect(displayRate('1.4712345678')).toBe('1.47');
    expect(displayRate('0.0123456789')).toBe('0.0123');
    expect(displayRate('1.4750000000')).toBe('1.48');
    expect(displayRate('147.0000000000')).toBe('147.00');
  });
  it('carries into the integer part', () => {
    expect(displayRate('1.9950000000')).toBe('2.00');
    expect(displayRate('0.9999500000')).toBe('1.0000');
  });
  it('handles a rate without a fractional part', () => {
    expect(displayRate('3')).toBe('3.00');
  });
});

void minorUnits;
