// Integration I-05 (data W6-13 WR-07 contract): useRecordContext DECIDES from the money prefs --
// `ready` gates new-account currency defaults and the Activity screen -- so it must not report
// ready while `prefs` is only the USD placeholder (a failed read, or a read paused offline).
// Phase 2.2 (D-11, D-16, D-23): week start, horizon, sample state.
import { renderHook } from '@testing-library/react-native';
import { useRecordContext } from '../useRecordContext';

let mockPrefsQuery: Record<string, unknown>;
let mockRecordPrefs: Record<string, unknown> = { week_start: null, sample_prompt_answered_at: null };
let mockDeviceRegion: string | undefined;

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signed-in', user: { id: 'u1' } }) }));
jest.mock('@/data/queries/household', () => ({ useHouseholdId: () => ({ data: 'h1', isLoading: false }) }));
jest.mock('@/data/queries/moneyPrefs', () => ({ useMoneyPrefs: () => mockPrefsQuery }));
jest.mock('@/data/queries/recordPrefs', () => ({
  useRecordPrefs: () => ({ prefs: mockRecordPrefs, loading: false, isSuccess: true }),
  useHouseholdHorizon: () => ({ horizonMonth: '2026-12', isSuccess: true }),
  useSampleExists: () => ({ hasSamples: true, isSuccess: true }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  getDeviceTimeZone: () => 'Europe/London',
  getDeviceRegion: () => mockDeviceRegion,
}));

const PLACEHOLDER = { home_currency: 'USD', show_cents: false, lead_figure: 'home', region: null };

describe('useRecordContext', () => {
  it('is ready once the prefs are a successful read', async () => {
    mockPrefsQuery = {
      prefs: { ...PLACEHOLDER, home_currency: 'EUR' },
      loading: false,
      isSuccess: true,
      isError: false,
      isFetchedAfterMount: true,
    };
    const { result } = await renderHook(() => useRecordContext());
    expect(result.current.ready).toBe(true);
    expect(result.current.homeCurrency).toBe('EUR');
  });

  it.each([
    ['failed', { prefs: PLACEHOLDER, loading: false, isSuccess: false, isError: true, isFetchedAfterMount: false }],
    ['paused offline with nothing cached', { prefs: PLACEHOLDER, loading: false, isSuccess: false, isError: false, isFetchedAfterMount: false }],
  ])('I-05: is not ready while the prefs read is %s (prefs are only the placeholder)', async (_label, query) => {
    mockPrefsQuery = query;
    const { result } = await renderHook(() => useRecordContext());
    expect(result.current.ready).toBe(false);
  });

  describe('record polish context (D-11, D-16, D-23)', () => {
    beforeEach(() => {
      mockPrefsQuery = { prefs: PLACEHOLDER, loading: false, isSuccess: true, isError: false, isFetchedAfterMount: true };
      mockRecordPrefs = { week_start: null, sample_prompt_answered_at: null };
      mockDeviceRegion = undefined;
    });

    it('uses the stored week start over the device region', async () => {
      mockRecordPrefs = { week_start: 0, sample_prompt_answered_at: '2026-10-01T00:00:00Z' };
      mockDeviceRegion = 'GB';
      const { result } = await renderHook(() => useRecordContext());
      expect(result.current.weekStart).toBe(0);
      expect(result.current.samplePromptAnswered).toBe(true);
    });

    it('falls back to the device region default (US is Sunday-first)', async () => {
      mockDeviceRegion = 'US';
      const { result } = await renderHook(() => useRecordContext());
      expect(result.current.weekStart).toBe(0);
    });

    it('falls back to Monday when nothing resolves', async () => {
      const { result } = await renderHook(() => useRecordContext());
      expect(result.current.weekStart).toBe(1);
      expect(result.current.samplePromptAnswered).toBe(false);
    });

    it('exposes the horizon month and sample existence', async () => {
      const { result } = await renderHook(() => useRecordContext());
      expect(result.current.horizonMonth).toBe('2026-12');
      expect(result.current.hasSamples).toBe(true);
    });
  });
});
