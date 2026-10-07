// 02-31 finding 2: first sign-in sets home currency from the device region, once, and only for
// a profile that still holds the server default and has recorded nothing.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useDeviceHomeCurrencyDefault, homeCurrencyDefaultKey } from '../useDeviceHomeCurrencyDefault';

// W6-13 WR-07: the default is applied through a server-conditional write (only while the profile
// still holds USD), never the unconditional setHomeCurrency patch.
const mockSetHomeCurrency = jest.fn(async (_code: string) => true);
const mockUnconditional = jest.fn();
let mockUser: { id: string } | null;
let mockHouseholdId: string | null | undefined;
let mockPrefs: { home_currency: string; show_cents: boolean; lead_figure: 'home'; region: string | null };
let mockPrefsLoading: boolean;
let mockPrefsState: { isSuccess: boolean; isError: boolean; isFetchedAfterMount: boolean };
let mockAccounts: { data: unknown[] | undefined; isLoading: boolean; isError: boolean; isFetchedAfterMount?: boolean };
let mockOptions: { options: { code: string }[]; loading: boolean };
let mockRegion: string | undefined;

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signed-in', user: mockUser }) }));
jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: mockHouseholdId, isLoading: false }),
}));
jest.mock('@/data/queries/moneyPrefs', () => ({
  useMoneyPrefs: () => ({ prefs: mockPrefs, loading: mockPrefsLoading, ...mockPrefsState }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => mockAccounts }));
jest.mock('@/data/queries/currencyOptions', () => ({ useCurrencyOptions: () => mockOptions }));
jest.mock('@/data/mutations/moneyPrefs', () => ({
  useUpdateMoneyPrefs: () => ({ setHomeCurrency: mockUnconditional }),
  useSetHomeCurrencyIfDefault: () => mockSetHomeCurrency,
}));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceRegion: () => mockRegion }));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockUser = { id: 'u1' };
  mockHouseholdId = 'h1';
  mockPrefs = { home_currency: 'USD', show_cents: false, lead_figure: 'home', region: null };
  mockPrefsLoading = false;
  mockPrefsState = { isSuccess: true, isError: false, isFetchedAfterMount: true };
  mockAccounts = { data: [], isLoading: false, isError: false, isFetchedAfterMount: true };
  mockOptions = { options: [{ code: 'USD' }, { code: 'CAD' }, { code: 'EUR' }], loading: false };
  mockRegion = 'CA';
});

describe('useDeviceHomeCurrencyDefault', () => {
  it('sets CAD for a fresh account on a Canadian device, and remembers it did', async () => {
    await renderHook(() => useDeviceHomeCurrencyDefault());
    await waitFor(() => expect(mockSetHomeCurrency).toHaveBeenCalledWith('CAD'));
    expect(mockSetHomeCurrency).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect(await AsyncStorage.getItem(homeCurrencyDefaultKey('u1'))).toBe('1'));
  });

  it('does nothing when the device region resolves to USD (already the stored value)', async () => {
    mockRegion = 'US';
    await renderHook(() => useDeviceHomeCurrencyDefault());
    await waitFor(async () => expect(await AsyncStorage.getItem(homeCurrencyDefaultKey('u1'))).toBe('1'));
    expect(mockSetHomeCurrency).not.toHaveBeenCalled();
  });

  it('never changes a currency that is not the server default', async () => {
    mockPrefs = { ...mockPrefs, home_currency: 'GBP' };
    await renderHook(() => useDeviceHomeCurrencyDefault());
    await waitFor(async () => expect(await AsyncStorage.getItem(homeCurrencyDefaultKey('u1'))).toBe('1'));
    expect(mockSetHomeCurrency).not.toHaveBeenCalled();
  });

  it('never applies once any account exists', async () => {
    mockAccounts = { data: [{ id: 'a1' }], isLoading: false, isError: false, isFetchedAfterMount: true };
    await renderHook(() => useDeviceHomeCurrencyDefault());
    await waitFor(async () => expect(await AsyncStorage.getItem(homeCurrencyDefaultKey('u1'))).toBe('1'));
    expect(mockSetHomeCurrency).not.toHaveBeenCalled();
  });

  it('applies at most once per user (the flag survives a remount)', async () => {
    await AsyncStorage.setItem(homeCurrencyDefaultKey('u1'), '1');
    await renderHook(() => useDeviceHomeCurrencyDefault());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockSetHomeCurrency).not.toHaveBeenCalled();
  });

  it('skips a currency the app does not offer, without repeating the check', async () => {
    mockRegion = 'JP';
    await renderHook(() => useDeviceHomeCurrencyDefault());
    await waitFor(async () => expect(await AsyncStorage.getItem(homeCurrencyDefaultKey('u1'))).toBe('1'));
    expect(mockSetHomeCurrency).not.toHaveBeenCalled();
  });

  it('skips when no region resolves', async () => {
    mockRegion = undefined;
    await renderHook(() => useDeviceHomeCurrencyDefault());
    await waitFor(async () => expect(await AsyncStorage.getItem(homeCurrencyDefaultKey('u1'))).toBe('1'));
    expect(mockSetHomeCurrency).not.toHaveBeenCalled();
  });

  it('WR-07: a choice made elsewhere meanwhile wins (conditional write applies nothing), and the check is recorded', async () => {
    mockSetHomeCurrency.mockResolvedValueOnce(false);
    await renderHook(() => useDeviceHomeCurrencyDefault());
    await waitFor(async () => expect(await AsyncStorage.getItem(homeCurrencyDefaultKey('u1'))).toBe('1'));
    expect(mockSetHomeCurrency).toHaveBeenCalledWith('CAD');
  });

  it('WR-07: a failed conditional write does not record the check, so it retries next launch', async () => {
    mockSetHomeCurrency.mockRejectedValueOnce(new Error('offline'));
    await renderHook(() => useDeviceHomeCurrencyDefault());
    await waitFor(() => expect(mockSetHomeCurrency).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it.each([
    ['prefs still loading', () => { mockPrefsLoading = true; mockPrefsState = { isSuccess: false, isError: false, isFetchedAfterMount: false }; }],
    // WR-07: a failed read returns the USD placeholder; it must never look like the server default.
    ['prefs read failed (placeholder USD)', () => { mockPrefsState = { isSuccess: false, isError: true, isFetchedAfterMount: true }; }],
    // WR-07: a persisted copy from an earlier session may predate a choice made on another device.
    ['prefs only cached, not re-read this mount', () => { mockPrefsState = { isSuccess: true, isError: false, isFetchedAfterMount: false }; }],
    ['accounts only cached, not re-read this mount', () => { mockAccounts = { data: [], isLoading: false, isError: false, isFetchedAfterMount: false }; }],
    ['accounts still loading', () => { mockAccounts = { data: undefined, isLoading: true, isError: false }; }],
    ['accounts read failed', () => { mockAccounts = { data: undefined, isLoading: false, isError: true }; }],
    ['currency list not loaded yet', () => { mockOptions = { options: [], loading: true }; }],
    ['no household yet', () => { mockHouseholdId = null; }],
    ['signed out', () => { mockUser = null; }],
  ])('waits, and does not record the check, while %s', async (_name, setup) => {
    setup();
    await renderHook(() => useDeviceHomeCurrencyDefault());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockSetHomeCurrency).not.toHaveBeenCalled();
    expect(mockUnconditional).not.toHaveBeenCalled();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});
