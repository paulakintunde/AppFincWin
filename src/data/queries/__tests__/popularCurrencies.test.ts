import { POPULAR_CURRENCY_GROUPS, currencyPickerSections, type CurrencyOption } from '../currencyOptions';

function opt(code: string, kind: 'iso' | 'custom' = 'iso'): CurrencyOption {
  return { code, name: `${code} name`, symbol: null, exponent: 2, kind, rateDate: null };
}
const ALL_POPULAR = POPULAR_CURRENCY_GROUPS.flatMap((g) => g.codes);

describe('POPULAR_CURRENCY_GROUPS', () => {
  it('is the decided list, in order, max 4 per continent', () => {
    expect(POPULAR_CURRENCY_GROUPS).toEqual([
      { continent: 'northAmerica', codes: ['USD', 'CAD', 'MXN'] },
      { continent: 'southAmerica', codes: ['BRL', 'ARS', 'COP', 'CLP'] },
      { continent: 'europe', codes: ['EUR', 'GBP', 'CHF', 'SEK'] },
      { continent: 'asia', codes: ['CNY', 'JPY', 'INR', 'KRW'] },
      { continent: 'africa', codes: ['NGN', 'ZAR', 'EGP', 'KES'] },
      { continent: 'oceania', codes: ['AUD', 'NZD'] },
    ]);
    for (const g of POPULAR_CURRENCY_GROUPS) expect(g.codes.length).toBeLessThanOrEqual(4);
  });
});

describe('currencyPickerSections', () => {
  const full = [...ALL_POPULAR, 'DKK', 'PLN'].map((c) => opt(c)).sort((a, b) => a.code.localeCompare(b.code));

  it('puts the home currency first and alone, not repeated in Popular', () => {
    const s = currencyPickerSections(full, 'GBP');
    expect(s.home?.code).toBe('GBP');
    const europe = s.popular.find((g) => g.continent === 'europe');
    expect(europe?.options.map((o) => o.code)).toEqual(['EUR', 'CHF', 'SEK']);
  });

  it('groups popular currencies by continent in the decided order', () => {
    const s = currencyPickerSections(full, 'DKK');
    expect(s.home?.code).toBe('DKK');
    expect(s.popular.map((g) => g.continent)).toEqual(['northAmerica', 'southAmerica', 'europe', 'asia', 'africa', 'oceania']);
    expect(s.popular[3]?.options.map((o) => o.code)).toEqual(['CNY', 'JPY', 'INR', 'KRW']);
  });

  it('silently drops popular currencies that are not offered, and omits empty continents', () => {
    const s = currencyPickerSections([opt('AUD'), opt('USD'), opt('DKK')], 'DKK');
    expect(s.popular).toEqual([
      { continent: 'northAmerica', options: [opt('USD')] },
      { continent: 'oceania', options: [opt('AUD')] },
    ]);
  });

  it('keeps A-Z complete: every option, home and popular included, plus customs', () => {
    const withCustom = [...full, opt('GLD', 'custom')];
    const s = currencyPickerSections(withCustom, 'USD');
    expect(s.all.map((o) => o.code)).toEqual(withCustom.map((o) => o.code));
  });

  it('has no home entry when the home currency is not offered', () => {
    const s = currencyPickerSections([opt('USD')], 'ZZZ');
    expect(s.home).toBeNull();
    expect(s.popular[0]?.options.map((o) => o.code)).toEqual(['USD']);
  });

  it('never invents a currency', () => {
    expect(currencyPickerSections([], 'USD')).toEqual({ home: null, popular: [], all: [] });
  });
});
