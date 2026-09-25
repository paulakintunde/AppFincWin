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
});
