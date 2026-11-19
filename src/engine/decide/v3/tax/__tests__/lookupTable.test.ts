/**
 * 05.4-61 (D-177 a): the included-country list and the dated source strings, written out literally.
 */
import { TAX_DEFAULTS } from '../defaults';
import { INCLUDED_COUNTRIES, lookupTaxDefault } from '../lookup';

const US_SOURCE = 'Tax Foundation, State and Local Sales Tax Rates as of July 1, 2026 (taxfoundation.org/data/all/state/2026-sales-tax-rates/)';
const CA_SOURCE = 'Canada Revenue Agency, GST/HST calculator (and rates), GST/HST and PST rates by province (canada.ca)';

describe('05.4-61 included countries, one by one', () => {
  it.each([
    'GB', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  ])('%s counts the price as tax included', (code) => {
    expect(lookupTaxDefault({ country: code, subdivision: null })).toEqual({ kind: 'included' });
    expect(INCLUDED_COUNTRIES).toContain(code);
  });

  it('is exactly 28 codes, the empty string is not one', () => {
    expect(INCLUDED_COUNTRIES).toHaveLength(28);
    expect(INCLUDED_COUNTRIES).not.toContain('');
    expect(lookupTaxDefault({ country: '', subdivision: null })).toEqual({ kind: 'unknown' });
    expect(lookupTaxDefault({ country: '', subdivision: '' })).toEqual({ kind: 'unknown' });
  });

  it('only the US and Canada are looked up by state or province; others are unknown even if a row key would match', () => {
    expect(lookupTaxDefault({ country: 'US', subdivision: 'NY' })).toMatchObject({ kind: 'add' });
    expect(lookupTaxDefault({ country: 'CA', subdivision: 'NS' })).toMatchObject({ kind: 'add' });
    expect(lookupTaxDefault({ country: 'US', subdivision: null })).toEqual({ kind: 'unknown' });
    expect(lookupTaxDefault({ country: 'CA', subdivision: null })).toEqual({ kind: 'unknown' });
    expect(lookupTaxDefault({ country: 'MX', subdivision: 'AL' })).toEqual({ kind: 'unknown' });
    expect(lookupTaxDefault({ country: '', subdivision: '' })).toEqual({ kind: 'unknown' });
  });
});

describe('05.4-61 dates and sources, written out', () => {
  it('every US row carries the 1 July 2026 date and the Tax Foundation source', () => {
    for (const [k, row] of Object.entries(TAX_DEFAULTS)) {
      if (!k.startsWith('US-')) continue;
      expect({ k, asOf: row.asOf, source: row.source }).toEqual({ k, asOf: '2026-07-01', source: US_SOURCE });
    }
  });

  it('every Canadian row carries the 1 April 2025 date and the CRA source', () => {
    for (const [k, row] of Object.entries(TAX_DEFAULTS)) {
      if (!k.startsWith('CA-')) continue;
      expect({ k, asOf: row.asOf, source: row.source }).toEqual({ k, asOf: '2025-04-01', source: CA_SOURCE });
    }
  });

  it('the lookup hands the dated, sourced row through', () => {
    expect(lookupTaxDefault({ country: 'CA', subdivision: 'ON' })).toEqual({
      kind: 'add',
      percent: TAX_DEFAULTS['CA-ON']!.percent,
      basis: 'hst',
      asOf: '2025-04-01',
      source: CA_SOURCE,
    });
  });
});
