/**
 * WR-A10/WR-A11/RD-02: useAmountParser is the one place any amount-entry field parses a
 * figure, so its region wiring and error copy are tested end-to-end against the real
 * useDeviceLocale (only expo-localization itself is mocked, mirroring
 * src/services/locale/__tests__/deviceLocale.test.ts) -- this test does not re-derive RD-02's
 * precedence, it only verifies useAmountParser consumes useDeviceLocale's resolved output.
 */
import { getCalendars, getLocales, useCalendars, useLocales } from 'expo-localization';
import { renderHook } from '@testing-library/react-native';
import type { ParseError } from '@/engine/money';
import { useAmountParser, type AmountParseFailure } from '../useAmountParser';

// Default to an empty array (not undefined): useAmountParser pulls in src/i18n/index.ts
// (for useT), whose module-load-time resolveInitialLng() calls getLocales()[0] before any
// per-test mockReturnValue below is set.
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => []),
  getCalendars: jest.fn(() => []),
  useLocales: jest.fn(() => []),
  useCalendars: jest.fn(() => []),
}));

const mockGetLocales = getLocales as jest.Mock;
const mockGetCalendars = getCalendars as jest.Mock;
const mockUseLocales = useLocales as jest.Mock;
const mockUseCalendars = useCalendars as jest.Mock;

const enUS = {
  languageTag: 'en-US',
  languageCode: 'en',
  languageScriptCode: null,
  regionCode: 'US',
  decimalSeparator: '.',
  digitGroupingSeparator: ',',
};

function mockDevice(locale: Record<string, unknown>, timeZone = 'America/New_York') {
  mockGetLocales.mockReturnValue([locale]);
  mockUseLocales.mockReturnValue([locale]);
  mockGetCalendars.mockReturnValue([{ timeZone }]);
  mockUseCalendars.mockReturnValue([{ timeZone }]);
}

const ALL_PARSE_ERRORS: readonly ParseError[] = [
  'empty',
  'invalid',
  'ambiguous-separator',
  'too-many-decimals',
  'too-large',
];

describe('useAmountParser', () => {
  it('en-US: "12,50" is ambiguous-separator, with a region-correct example in the message', async () => {
    mockDevice(enUS);
    const { result } = await renderHook(() => useAmountParser());

    const parsed = result.current.parse('12,50', 'USD');
    expect(parsed).toEqual({ ok: false, error: 'ambiguous-separator', maxDecimals: 2 });

    const example = new Intl.NumberFormat('en-US').format(1234.5);
    expect(example).toBe('1,234.5');
    const message = result.current.errorMessage(parsed as AmountParseFailure);
    expect(message).toBe(`That doesn’t match how amounts are written here — try ${example}.`);
  });

  it('de-DE region override on an en-language device: "12,50" parses to 1250 minor units', async () => {
    mockDevice(enUS);
    const { result } = await renderHook(() => useAmountParser('DE'));

    expect(result.current.parse('12,50', 'EUR')).toEqual({ ok: true, value: 1250 });
  });

  it.each([
    ['DE', 'EUR', 123456, '1234,56'],
    ['DE', 'KWD', 500000, '500,000'],
    ['FR', 'EUR', -1250, '12,50'],
    ['FR', 'KWD', 5, '0,005'],
    ['US', 'USD', 123456, '1234.56'],
    ['JP', 'JPY', 1200, '1200'],
  ])('S-CR-01: %s %s toInputText(%d) is %s and parses back to the magnitude', async (region, code, minor, text) => {
    mockDevice(enUS);
    const { result } = await renderHook(() => useAmountParser(region));
    expect(result.current.toInputText(minor, code)).toBe(text);
    expect(result.current.parse(text, code)).toEqual({ ok: true, value: Math.abs(minor) });
  });

  it('an unambiguous grouped amount still parses under the same region', async () => {
    mockDevice(enUS);
    const { result } = await renderHook(() => useAmountParser());

    expect(result.current.parse('1,234.56', 'USD')).toEqual({ ok: true, value: 123456 });
  });

  it.each(ALL_PARSE_ERRORS)('maps ParseError %s to a non-empty message', async (error) => {
    mockDevice(enUS);
    const { result } = await renderHook(() => useAmountParser());

    const message = result.current.errorMessage({ ok: false, error, maxDecimals: 2 });
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(0);
  });

  it('pluralises too-many-decimals by maxDecimals', async () => {
    mockDevice(enUS);
    const { result } = await renderHook(() => useAmountParser());

    expect(result.current.errorMessage({ ok: false, error: 'too-many-decimals', maxDecimals: 0 })).toBe(
      'No decimal places here.'
    );
    expect(result.current.errorMessage({ ok: false, error: 'too-many-decimals', maxDecimals: 1 })).toBe(
      'Up to 1 decimal place here.'
    );
    expect(result.current.errorMessage({ ok: false, error: 'too-many-decimals', maxDecimals: 3 })).toBe(
      'Up to 3 decimal places here.'
    );
  });
  describe('06.1-52 (C-10): the field’s own currency marker and grouping', () => {
    it.each([
      ['$150', 15000],
      ['150 $', 15000],
      [' $1,200.50 ', 120050],
      ['1,200.50', 120050],
      ['USD 150', 15000],
    ])('en-US USD: %j parses to %d', async (text, minor) => {
      mockDevice(enUS);
      const { result } = await renderHook(() => useAmountParser());
      expect(result.current.parse(text, 'USD')).toEqual({ ok: true, value: minor });
    });

    it('de-DE: "€12,50" parses to 1250', async () => {
      mockDevice(enUS);
      const { result } = await renderHook(() => useAmountParser('DE'));
      expect(result.current.parse('€12,50', 'EUR')).toEqual({ ok: true, value: 1250 });
      expect(result.current.parse('12,50 €', 'EUR')).toEqual({ ok: true, value: 1250 });
    });

    it('T-06.1-52-01: another currency’s symbol still fails ("£150" for USD, "$150" for CAD)', async () => {
      mockDevice(enUS);
      const { result } = await renderHook(() => useAmountParser());
      expect(result.current.parse('£150', 'USD')).toEqual({ ok: false, error: 'invalid', maxDecimals: 2 });
      expect(result.current.parse('$150', 'CAD')).toEqual({ ok: false, error: 'invalid', maxDecimals: 2 });
      expect(result.current.parse('CA$150', 'CAD')).toEqual({ ok: true, value: 15000 });
      expect(result.current.parse('abc', 'USD')).toEqual({ ok: false, error: 'invalid', maxDecimals: 2 });
      expect(result.current.parse('$$150', 'USD')).toEqual({ ok: false, error: 'invalid', maxDecimals: 2 });
    });

    it('a custom code Intl cannot read keeps only the code as a marker', async () => {
      mockDevice(enUS);
      const { result } = await renderHook(() => useAmountParser());
      expect(result.current.parse('GLD 5', 'GLD', 0)).toEqual({ ok: true, value: 5 });
      expect(result.current.parse('5', 'gold', 0)).toEqual({ ok: true, value: 5 });
    });

    it('the invalid message reads digits only, with the region’s own marks', async () => {
      mockDevice(enUS);
      const { result } = await renderHook(() => useAmountParser());
      expect(result.current.errorMessage({ ok: false, error: 'invalid', maxDecimals: 2 })).toBe('Digits only, like 1200 or 1,200.50.');
      expect(result.current.errorMessage({ ok: false, error: 'invalid', maxDecimals: 0 })).toBe('Digits only, like 1200 or 1,200.');
      const de = await renderHook(() => useAmountParser('DE'));
      expect(de.result.current.errorMessage({ ok: false, error: 'invalid', maxDecimals: 2 })).toBe('Digits only, like 1200 or 1.200,50.');
    });
  });

  describe('06.1-52 (X-4): toDisplayText', () => {
    it.each([
      ['US', 'USD', 900000, '9,000'],
      ['US', 'USD', 900050, '9,000.50'],
      ['US', 'USD', 5, '0.05'],
      ['US', 'USD', 0, '0'],
      ['US', 'USD', -123456789, '1,234,567.89'],
      ['DE', 'EUR', 120050, '1.200,50'],
      ['JP', 'JPY', 1200000, '1,200,000'],
      ['IN', 'INR', 123456700, '12,34,567'],
    ])('%s %s %d reads %s and parses back', async (region, code, minor, text) => {
      mockDevice(enUS);
      const { result } = await renderHook(() => useAmountParser(region));
      expect(result.current.toDisplayText(minor, code)).toBe(text);
      expect(result.current.parse(text, code)).toEqual({ ok: true, value: Math.abs(minor) });
    });
  });
});
