// Integration I-05 (data W6-13 WR-07 contract): useRecordContext DECIDES from the money prefs --
// `ready` gates new-account currency defaults and the Activity screen -- so it must not report
// ready while `prefs` is only the USD placeholder (a failed read, or a read paused offline).
import { renderHook } from '@testing-library/react-native';
import { useRecordContext } from '../useRecordContext';

let mockPrefsQuery: Record<string, unknown>;

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signed-in', user: { id: 'u1' } }) }));
jest.mock('@/data/queries/household', () => ({ useHouseholdId: () => ({ data: 'h1', isLoading: false }) }));
jest.mock('@/data/queries/moneyPrefs', () => ({ useMoneyPrefs: () => mockPrefsQuery }));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceTimeZone: () => 'Europe/London' }));

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
});
