import { formatAmount, formatMoneyA11y, toDecimalString } from '../formatAmount';
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

describe('formatAmount: ambiguous dollar symbol disambiguation (D-23, D-94)', () => {
  const usd = { amount: minorUnits(150000), currency: currencyCode('USD') };
  const at = (code: string, locale: string, amount = 150000) =>
    formatAmount({ amount: minorUnits(amount), currency: currencyCode(code) }, { locale, showCents: false });

  it('shows CA$ for CAD in en-US', () => {
    expect(at('CAD', 'en-US', 1000).startsWith('CA$')).toBe(true);
  });

  it('D-94 USD always shows $', () => {
    for (const locale of ['en-US', 'en-GB', 'en-CA']) {
      expect(formatAmount(usd, { locale, showCents: false })).toBe('$1,500');
    }
    const fr = formatAmount(usd, { locale: 'fr-CA', showCents: false });
    expect(fr).toMatch(/^1\s500\s\$$/u);
    expect(fr).not.toContain('US');
  });

  it('D-94 other dollar currencies keep their marker', () => {
    expect(at('CAD', 'en-CA')).toBe('CA$1,500');
    expect(at('AUD', 'en-AU')).toBe('A$1,500');
    expect(at('NZD', 'en-NZ')).toBe('NZ$1,500');
    expect(at('HKD', 'en-HK')).toBe('HK$1,500');
    expect(at('SGD', 'en-SG')).toBe('S$1,500');
    expect(at('TWD', 'zh-TW')).toBe('NT$1,500');
    expect(at('MXN', 'es-MX')).toBe('MX$1,500');
    expect(at('MXN', 'es-MX', -150000)).toBe('−MX$1,500');
  });

  it('D-94 any other bare-$ currency takes its ISO code and a no-break space', () => {
    const ars = at('ARS', 'es-AR');
    expect(ars.startsWith('ARS ')).toBe(true);
    expect(ars).not.toContain('$');
    expect(ars).not.toMatch(/ [  ]/);
  });

  it('D-94 non-dollar symbols are unchanged', () => {
    const gbp = { amount: minorUnits(150000), currency: currencyCode('GBP') };
    const eur = { amount: minorUnits(150000), currency: currencyCode('EUR') };
    expect(formatAmount(gbp, { locale: 'en-GB', showCents: false })).toBe('£1,500');
    expect(formatAmount(eur, { locale: 'en-IE', showCents: false })).toBe('€1,500');
  });
});

describe('formatMoneyA11y (D-94)', () => {
  const read = (code: string, locale: string, home: string, amount = 150000) =>
    formatMoneyA11y(
      { amount: minorUnits(amount), currency: currencyCode(code) },
      { locale, showCents: false, homeCurrency: home }
    );

  it('D-94 money reads currency names aloud', () => {
    expect(read('USD', 'en-US', 'USD')).toBe('1,500 dollars');
    expect(read('USD', 'en-CA', 'CAD')).toBe('1,500 US dollars');
    expect(read('CAD', 'en-CA', 'CAD')).toBe('1,500 Canadian dollars');
    expect(read('GBP', 'en-GB', 'GBP')).toBe('1,500 British pounds');
    expect(read('MXN', 'es-MX', 'MXN').length).toBeGreaterThan(0);
    expect(read('USD', 'en-US', 'USD', -150050)).toBe('−1,500.50 dollars');
  });

  it('D-94 a custom $ currency keeps its symbol', () => {
    const money = { amount: minorUnits(2500), currency: currencyCode('GLD') };
    const base = { locale: 'en-US', showCents: false, exponent: 0, customSymbol: '$' };
    expect(formatAmount(money, base)).toBe('$2,500');
    expect(formatMoneyA11y(money, { ...base, customName: 'Gold coins' })).toBe('2,500 Gold coins');
    expect(formatMoneyA11y(money, base)).toBe('2,500 $');
    expect(
      formatMoneyA11y({ amount: minorUnits(-2500), currency: currencyCode('GLD') }, base)
    ).toBe('−2,500 $');
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
