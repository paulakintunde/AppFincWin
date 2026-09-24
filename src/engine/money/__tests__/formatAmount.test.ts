import { formatAmount, toDecimalString } from '../formatAmount';
import { currencyCode, minorUnits } from '../types';

describe('toDecimalString', () => {
  it.each([
    [-12345, 2, '-123.45'],
    [5, 3, '0.005'],
    [1200, 0, '1200'],
    [7, 2, '0.07'],
  ])('toDecimalString(%i, %i) === %p', (amount, exponent, expected) => {
    expect(toDecimalString(minorUnits(amount), exponent)).toBe(expected);
  });
});

describe('formatAmount: D-23 show-cents rules (en-US USD)', () => {
  it('drops decimals for a whole amount when showCents is false', () => {
    const money = { amount: minorUnits(123400), currency: currencyCode('USD') };
    expect(formatAmount(money, { locale: 'en-US', showCents: false })).toBe('$1,234');
  });

  it('shows decimals for a whole amount when showCents is true', () => {
    const money = { amount: minorUnits(123400), currency: currencyCode('USD') };
    expect(formatAmount(money, { locale: 'en-US', showCents: true })).toBe('$1,234.00');
  });

  it('always shows decimals for a non-whole amount, regardless of showCents', () => {
    const money = { amount: minorUnits(123456), currency: currencyCode('USD') };
    expect(formatAmount(money, { locale: 'en-US', showCents: false })).toBe('$1,234.56');
  });
});

describe('formatAmount: true minus, never a hyphen', () => {
  it('renders a negative en-US USD amount with U+2212 and no U+002D', () => {
    const money = { amount: minorUnits(-123456), currency: currencyCode('USD') };
    const result = formatAmount(money, { locale: 'en-US', showCents: false });
    expect(result).toBe('−$1,234.56');
    expect(result).not.toContain('-');
  });
});

describe('formatAmount: de-DE EUR matches Intl’s own output exactly', () => {
  it('matches a bare Intl.NumberFormat currency call, narrow-no-break-space included', () => {
    const money = { amount: minorUnits(123456), currency: currencyCode('EUR') };
    const expected = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
      1234.56
    );
    expect(formatAmount(money, { locale: 'de-DE', showCents: true })).toBe(expected);
  });
});

describe('formatAmount: ja-JP JPY never shows decimals (exponent 0)', () => {
  it('matches Intl’s own zero-decimal JPY output', () => {
    const money = { amount: minorUnits(1200), currency: currencyCode('JPY') };
    const expected = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(
      1200
    );
    expect(formatAmount(money, { locale: 'ja-JP', showCents: true })).toBe(expected);
  });
});

describe('formatAmount: ar-KW KWD shows three fraction digits for a non-whole amount', () => {
  it('matches Intl’s own three-decimal KWD output', () => {
    const money = { amount: minorUnits(1234), currency: currencyCode('KWD') };
    const expected = new Intl.NumberFormat('ar-KW', { style: 'currency', currency: 'KWD' }).format(
      1.234
    );
    expect(formatAmount(money, { locale: 'ar-KW', showCents: false })).toBe(expected);
  });
});

describe('formatAmount: ambiguous dollar symbol disambiguation (D-23)', () => {
  it('shows CA$ for CAD in en-US', () => {
    const money = { amount: minorUnits(1000), currency: currencyCode('CAD') };
    expect(formatAmount(money, { locale: 'en-US', showCents: false }).startsWith('CA$')).toBe(
      true
    );
  });

  it('shows US$ for USD in en-CA', () => {
    const money = { amount: minorUnits(1000), currency: currencyCode('USD') };
    expect(formatAmount(money, { locale: 'en-CA', showCents: false }).startsWith('US$')).toBe(
      true
    );
  });
});

describe('formatAmount: custom currency symbol', () => {
  it('prefixes the given symbol before the number', () => {
    const money = { amount: minorUnits(2500), currency: currencyCode('GLD') };
    expect(
      formatAmount(money, { locale: 'en-US', showCents: false, exponent: 0, customSymbol: 'G' })
    ).toBe('G2,500');
  });

  it('places the true minus before the symbol for a negative custom-currency amount', () => {
    const money = { amount: minorUnits(-2500), currency: currencyCode('GLD') };
    expect(
      formatAmount(money, { locale: 'en-US', showCents: false, exponent: 0, customSymbol: 'G' })
    ).toBe('−G2,500');
  });
});
