import { importExponentLookup } from '../currencyLookup';

describe('importExponentLookup (review HI-01)', () => {
  it('knows ISO codes and rejects words that only look like codes', () => {
    const lookup = importExponentLookup([], ['GBP']);
    expect(lookup('USD')).toBe(2);
    expect(lookup('KWD')).toBe(3);
    expect(lookup('REF')).toBeNull();
    expect(lookup('TEL')).toBeNull();
  });

  it("knows the user's custom currencies with their own decimals", () => {
    expect(importExponentLookup([{ code: 'GLD', decimals: 3 }], [])('GLD')).toBe(3);
  });

  it("knows a household account's currency even when the custom row is someone else's", () => {
    expect(importExponentLookup([], ['GLD'])('GLD')).toBe(2);
    expect(importExponentLookup([], [])('GLD')).toBeNull();
  });
});
