// 02-31 finding 2: first sign-in sets home currency from the device region, once, and only for
// a profile that still holds the server default and has recorded nothing.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useDeviceHomeCurrencyDefault, homeCurrencyDefaultKey } from '../useDeviceHomeCurrencyDefault';

const mockSetHomeCurrency = jest.fn();
let mockUser: { id: string } | null;
let mockHouseholdId: string | null | undefined;
let mockPrefs: { home_currency: string; show_cents: boolean; lead_figure: 'home'; region: string | null };
let mockPrefsLoading: boolean;
let mockAccounts: { data: unknown[] | undefined; isLoading: boolean; isError: boolean };
let mockOptions: { options: { code: string }[]; loading: boolean };
let mockRegion: string | undefined;

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signed-in', user: mockUser }) }));
jest.mock('@/data/queries/household', () => ({
  useHouseholdId: () => ({ data: mockHouseholdId, isLoading: false }),
}));
jest.mock('@/data/queries/moneyPrefs', () => ({
  useMoneyPrefs: () => ({ prefs: mockPrefs, loading: mockPrefsLoading }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => mockAccounts }));
jest.mock('@/data/queries/currencyOptions', () => ({ useCurrencyOptions: () => mockOptions }));
jest.mock('@/data/mutations/moneyPrefs', () => ({
  useUpdateMoneyPrefs: () => ({ setHomeCurrency: mockSetHomeCurrency }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceRegion: () => mockRegion }));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockUser = { id: 'u1' };
  mockHouseholdId = 'h1';
  mockPrefs = { home_currency: 'USD', show_cents: false, lead_figure: 'home', region: null };
  mockPrefsLoading = false;
  mockAccounts = { data: [], isLoading: false, isError: false };
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
    mockAccounts = { data: [{ id: 'a1' }], isLoading: false, isError: false };
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

  it.each([
    ['prefs still loading', () => { mockPrefsLoading = true; }],
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
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});
