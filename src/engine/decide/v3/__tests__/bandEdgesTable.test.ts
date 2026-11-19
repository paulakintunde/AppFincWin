/**
 * 05.4-61 (D-177 a): kills the band-table survivors. Expected values are written out, never read from the source constants.
 */
import { MAX_ABS_AMOUNT_MINOR } from '../../../money/types';
import { BAND_TABLE, REFERENCE_USD_RATES, homeThresholds, tidyFromUsd } from '../bandEdges';

describe('05.4-61 band table: the fixed reference rates and the tidy rule edges', () => {
  it('the reference rates are written out exactly, currency by currency', () => {
    expect({ ...REFERENCE_USD_RATES }).toEqual({
      USD: '1',
      EUR: '0.92',
      GBP: '0.79',
      CAD: '1.37',
      AUD: '1.52',
      NZD: '1.66',
      CHF: '0.88',
      JPY: '150',
      KRW: '1380',
      CNY: '7.2',
      INR: '84',
      NGN: '1530',
      ZAR: '18',
      KES: '129',
      GHS: '15.5',
      MXN: '19.5',
      BRL: '5.6',
      SGD: '1.33',
      HKD: '7.8',
      AED: '3.6725',
      SEK: '10.6',
      NOK: '10.9',
      DKK: '6.9',
      PLN: '4.0',
      PHP: '57',
    });
    expect(Object.keys(BAND_TABLE)).toEqual(Object.keys(REFERENCE_USD_RATES));
  });

  it('a decimal rate string is read exactly: 3.6725 dirham per US$', () => {
    // US$50 -> 183.625 AED -> 200 AED (1 significant figure, half up) = 20000 fils
    expect(BAND_TABLE.AED!.edges[0]).toBe(20000);
    // US$1 -> 3.6725 AED -> 4 AED
    expect(BAND_TABLE.AED!.quotedTolerance).toBe(400);
  });

  it('a whole-number rate string is read as a whole number (no fraction part)', () => {
    expect(BAND_TABLE.JPY!.quotedTolerance).toBe(200);
    expect(BAND_TABLE.KRW!.quotedTolerance).toBe(1000);
  });

  it('a rate with a trailing zero decimal ("4.0") reads as 4', () => {
    // US$50 -> 200 PLN exactly -> 200 PLN = 20000 groszy
    expect(BAND_TABLE.PLN!.edges[0]).toBe(20000);
    expect(BAND_TABLE.PLN!.quotedTolerance).toBe(400);
  });

  it('tidy rule at the edge of one whole major unit', () => {
    const one = { num: 1n, den: 1n };
    expect(tidyFromUsd(100, one, 2)).toBe(100);
    expect(tidyFromUsd(100, one, 0)).toBe(1);
    expect(tidyFromUsd(1000, one, 2)).toBe(1000);
  });

  it('under one major unit, tidies to 1 significant figure of the minor value', () => {
    const one = { num: 1n, den: 1n };
    expect(tidyFromUsd(50, one, 2)).toBe(50);
    expect(tidyFromUsd(1, one, 2)).toBe(1);
    expect(tidyFromUsd(35, one, 2)).toBe(40);
    expect(tidyFromUsd(34, one, 2)).toBe(30);
    expect(tidyFromUsd(99, one, 2)).toBe(100);
  });

  it('a clamp above the ceiling gives the ceiling', () => {
    expect(tidyFromUsd(MAX_ABS_AMOUNT_MINOR, { num: 10n, den: 1n }, 2)).toBe(MAX_ABS_AMOUNT_MINOR);
  });

  it('homeThresholds: USD comes from the table; a zero rate part is missing; a usable one is fallback', () => {
    expect(homeThresholds('USD', null).source).toBe('table');
    expect(homeThresholds('XYZ', { num: 0n, den: 1n }).source).toBe('missing');
    expect(homeThresholds('XYZ', { num: 1n, den: 0n }).source).toBe('missing');
    expect(homeThresholds('XYZ', { num: 1n, den: 1n }).source).toBe('fallback');
    expect(homeThresholds('XYZ', { num: -1n, den: -1n }).source).toBe('missing');
  });

  it('the USD entry is the identity table', () => {
    expect(BAND_TABLE.USD!.edges[0]).toBe(5000);
    expect(BAND_TABLE.USD!.edges[13]).toBe(500_000_000);
    expect(BAND_TABLE.EUR!.edges[0]).toBe(5000); // US$50 -> 46 EUR -> 50 EUR
    expect(BAND_TABLE.EUR!.edges[0]).not.toBe(BAND_TABLE.USD!.edges[1]);
  });
});
