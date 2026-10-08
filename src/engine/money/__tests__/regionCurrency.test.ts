import { currencyForRegion } from '../regionCurrency';
import { currencyExponent } from '../currencyExponents';

describe('currencyForRegion (02-31: home currency from the device region)', () => {
  it.each([
    ['CA', 'CAD'],
    ['US', 'USD'],
    ['GB', 'GBP'],
    ['DE', 'EUR'],
    ['FR', 'EUR'],
    ['IE', 'EUR'],
    ['AU', 'AUD'],
    ['NZ', 'NZD'],
    ['JP', 'JPY'],
    ['IN', 'INR'],
    ['CH', 'CHF'],
    ['SE', 'SEK'],
    ['BR', 'BRL'],
    ['ZA', 'ZAR'],
  ])('%s -> %s', (region, currency) => {
    expect(currencyForRegion(region)).toBe(currency);
  });

  // W6-13 IN-02: non-EU euro users, Liechtenstein (Swiss franc) and Russia.
  it.each([
    ['ME', 'EUR'],
    ['XK', 'EUR'],
    ['AD', 'EUR'],
    ['MC', 'EUR'],
    ['SM', 'EUR'],
    ['VA', 'EUR'],
    ['LI', 'CHF'],
    ['RU', 'RUB'],
  ])('IN-02: %s -> %s', (region, currency) => {
    expect(currencyForRegion(region)).toBe(currency);
    expect(Number.isInteger(currencyExponent(currency))).toBe(true);
  });

  it('is case-insensitive and trims', () => {
    expect(currencyForRegion(' ca ')).toBe('CAD');
  });

  it('returns undefined for an unknown, empty or malformed region', () => {
    expect(currencyForRegion('ZZ')).toBeUndefined();
    expect(currencyForRegion('')).toBeUndefined();
    expect(currencyForRegion('CAN')).toBeUndefined();
    expect(currencyForRegion('constructor')).toBeUndefined();
    expect(currencyForRegion(null)).toBeUndefined();
    expect(currencyForRegion(undefined)).toBeUndefined();
  });

  it('only ever yields 3-letter ISO codes the minor-unit table can handle', () => {
    for (const region of ['CA', 'JP', 'KW', 'DE', 'GB']) {
      const code = currencyForRegion(region);
      expect(code).toMatch(/^[A-Z]{3}$/);
      expect(Number.isInteger(currencyExponent(code as string))).toBe(true);
    }
  });
});
