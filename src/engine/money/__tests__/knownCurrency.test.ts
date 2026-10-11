import { ISO_CURRENCIES, currencyExponent, knownCurrencyExponent } from '..';

describe('knownCurrencyExponent (review HI-01)', () => {
  it('knows every built-in ISO code with its MON-13 exponent', () => {
    for (const c of ISO_CURRENCIES) expect(knownCurrencyExponent(c.code)).toBe(currencyExponent(c.code));
  });

  it.each(['REF', 'TEL', 'ATM', 'PCS', 'NBR', 'usd', 'US', 'XYZW', ''])('does not know %p', (code) => {
    expect(knownCurrencyExponent(code)).toBeNull();
  });

  it('knows a custom currency only when it is passed in', () => {
    expect(knownCurrencyExponent('GLD')).toBeNull();
    expect(knownCurrencyExponent('GLD', [{ code: 'GLD', decimals: 3 }])).toBe(3);
  });

  it('an ISO code keeps its ISO exponent', () => {
    expect(knownCurrencyExponent('JPY', [{ code: 'JPY', decimals: 2 }])).toBe(0);
  });
});
