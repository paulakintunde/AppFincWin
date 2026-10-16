import { percent } from '../../payoff/types';
import { currencyCode, minorUnits } from '../../money/types';
import { MARKET_DEFAULTS, minimumTermsFromDefaults } from '../marketDefaults';

describe('MARKET_DEFAULTS', () => {
  it('has the four rows in order', () => {
    expect(Object.keys(MARKET_DEFAULTS)).toEqual(['US', 'CA', 'CA-QC', 'UK']);
  });

  it('US row', () => {
    expect(MARKET_DEFAULTS.US).toEqual({
      currency: currencyCode('USD'),
      minimumPercent: percent('1'),
      interestAdded: true,
      floor: minorUnits(2_500),
      dealerCap: minorUnits(500_000),
    });
  });

  it('CA row', () => {
    expect(MARKET_DEFAULTS.CA).toEqual({
      currency: currencyCode('CAD'),
      minimumPercent: percent('2'),
      interestAdded: false,
      floor: minorUnits(1_000),
      dealerCap: null,
    });
  });

  it('CA-QC row leaves unsourced values null', () => {
    expect(MARKET_DEFAULTS['CA-QC']).toEqual({
      currency: currencyCode('CAD'),
      minimumPercent: percent('5'),
      interestAdded: null,
      floor: null,
      dealerCap: null,
    });
  });

  it('UK row', () => {
    expect(MARKET_DEFAULTS.UK).toEqual({
      currency: currencyCode('GBP'),
      minimumPercent: percent('1'),
      interestAdded: true,
      floor: minorUnits(500),
      dealerCap: null,
    });
  });

  it('no row carries an apr or rate (D-07)', () => {
    for (const row of Object.values(MARKET_DEFAULTS)) {
      expect(Object.keys(row).some((k) => /apr|rate/i.test(k))).toBe(false);
    }
  });
});

describe('minimumTermsFromDefaults', () => {
  it('returns terms when every field is present', () => {
    expect(minimumTermsFromDefaults(MARKET_DEFAULTS.US)).toEqual({
      minimumPercent: percent('1'),
      interestAdded: true,
      floor: minorUnits(2_500),
    });
  });

  it('returns null when any field is null (never borrowed)', () => {
    expect(minimumTermsFromDefaults(MARKET_DEFAULTS['CA-QC'])).toBeNull();
    expect(minimumTermsFromDefaults({ ...MARKET_DEFAULTS.US, floor: null })).toBeNull();
    expect(minimumTermsFromDefaults({ ...MARKET_DEFAULTS.US, interestAdded: null })).toBeNull();
    expect(minimumTermsFromDefaults({ ...MARKET_DEFAULTS.US, minimumPercent: null })).toBeNull();
  });
});
