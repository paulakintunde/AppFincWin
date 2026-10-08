import { currencyExponent } from '../currencyExponents';
import { ISO_CURRENCIES, ISO_CURRENCY_LIST_AS_OF, isoCurrency } from '../isoCurrencies';

const EXCLUDED = [
  'BOV',
  'CHE',
  'CHW',
  'CLF',
  'COU',
  'MXV',
  'USN',
  'UYI',
  'UYW',
  'XAG',
  'XAU',
  'XBA',
  'XBB',
  'XBC',
  'XBD',
  'XDR',
  'XPD',
  'XPT',
  'XSU',
  'XTS',
  'XUA',
  'XXX',
];

describe('ISO_CURRENCIES', () => {
  it('has an exponent equal to currencyExponent(code) for every entry', () => {
    for (const entry of ISO_CURRENCIES) {
      expect(entry.exponent).toBe(currencyExponent(entry.code));
    }
  });

  it('carries the known zero- and three-decimal currencies', () => {
    const expected: Record<string, number> = {
      JPY: 0,
      KRW: 0,
      VND: 0,
      KWD: 3,
      BHD: 3,
      OMR: 3,
      USD: 2,
    };
    for (const [code, exponent] of Object.entries(expected)) {
      expect(isoCurrency(code)?.exponent).toBe(exponent);
    }
  });

  it('has unique, sorted, three-letter upper-case codes', () => {
    const codes = ISO_CURRENCIES.map((c) => c.code);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{3}$/);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual([...codes].sort());
  });

  it('includes EUR and none of the fund, metal or testing codes', () => {
    expect(isoCurrency('EUR')).toBeDefined();
    for (const code of EXCLUDED) expect(isoCurrency(code)).toBeUndefined();
  });

  it('has a non-empty name and a null or non-empty symbol', () => {
    for (const entry of ISO_CURRENCIES) {
      expect(entry.name.length).toBeGreaterThan(0);
      if (entry.symbol !== null) expect(entry.symbol.length).toBeGreaterThan(0);
    }
  });

  it('looks up by exact code only', () => {
    expect(isoCurrency('GBP')?.name).toBeDefined();
    expect(isoCurrency('ZZZ')).toBeUndefined();
    expect(isoCurrency('gbp')).toBeUndefined();
  });

  it('records the snapshot date and is frozen', () => {
    expect(ISO_CURRENCY_LIST_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.isFrozen(ISO_CURRENCIES)).toBe(true);
  });
});
