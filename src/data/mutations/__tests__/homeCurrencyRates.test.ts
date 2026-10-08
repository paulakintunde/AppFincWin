// 02-49 Task 1: the home-currency-change rate check, its persisted retry and its wipe/user safety.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import { createSweepBudget } from '@/data/sync/sweepBudget';
import { noteResolveRateThrottled, resetResolveRateBackoffForTests } from '@/data/sync/resolveRateBackoff';
import { wipeDeviceData } from '@/services/storage/wipe';
import {
  ensureRatesForHomeChange,
  HOME_RATE_CHECK_KEY,
  retryOutstandingHomeRateCheck,
  type HomeRateCheck,
} from '../homeCurrencyRates';

const mockRequest = jest.fn();
const mockCurrencies = jest.fn();
jest.mock('@/db/fxResolve', () => ({
  ...jest.requireActual('@/db/fxResolve'),
  requestRatesForDate: (...a: unknown[]) => mockRequest(...a),
}));
jest.mock('@/db/householdCurrencies', () => ({ fetchHouseholdCurrencies: (...a: unknown[]) => mockCurrencies(...a) }));
jest.mock('../transactionCache', () => ({ lazySupabaseClient: () => ({ fake: true }) }));

const check = (over: Partial<HomeRateCheck> = {}): HomeRateCheck => ({
  userId: 'u1',
  homeCurrency: 'THB',
  date: '2026-10-08',
  householdId: 'h1',
  ...over,
});
const stored = async (): Promise<HomeRateCheck | null> => {
  const raw = await AsyncStorage.getItem(HOME_RATE_CHECK_KEY);
  return raw ? (JSON.parse(raw) as HomeRateCheck) : null;
};
const many = (n: number): string[] => Array.from({ length: n }, (_, i) => `C${String(i).padStart(3, '0')}`);

let qc: QueryClient;
beforeEach(async () => {
  mockRequest.mockReset();
  mockCurrencies.mockReset();
  resetResolveRateBackoffForTests();
  await AsyncStorage.clear();
  qc = new QueryClient();
});

describe('ensureRatesForHomeChange', () => {
  it('asks once for the new home first then the rest sorted, invalidates fxLatest, clears the record', async () => {
    mockCurrencies.mockResolvedValue(['EUR', 'GBP', 'THB', 'USD']);
    mockRequest.mockResolvedValue(['THB']);
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await AsyncStorage.setItem(HOME_RATE_CHECK_KEY, JSON.stringify(check()));
    expect(await ensureRatesForHomeChange(qc, check())).toBe('done');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith({ fake: true }, '2026-10-08', ['THB', 'EUR', 'GBP', 'USD']);
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.fxLatest() });
    expect(await stored()).toBeNull();
  });

  it.each([[[]], [['THB']]])('uses no other currency (%j) -> no call', async (used) => {
    mockCurrencies.mockResolvedValue(used);
    expect(await ensureRatesForHomeChange(qc, check())).toBe('nothing-to-fetch');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(await stored()).toBeNull();
  });

  it('splits 120 other codes into 50/50/23 each including the new home; a budget of 2 defers the rest', async () => {
    mockCurrencies.mockResolvedValue(many(120));
    mockRequest.mockResolvedValue([]);
    expect(await ensureRatesForHomeChange(qc, check())).toBe('done');
    expect(mockRequest.mock.calls.map((c) => (c[2] as string[]).length)).toEqual([50, 50, 23]);
    for (const c of mockRequest.mock.calls) expect((c[2] as string[])[0]).toBe('THB');

    mockRequest.mockClear();
    const budget = createSweepBudget(2);
    expect(await ensureRatesForHomeChange(qc, check(), budget)).toBe('deferred');
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(await stored()).toEqual(check());
  });

  it('no household id and none cached -> deferred, persisted, no call', async () => {
    expect(await ensureRatesForHomeChange(qc, check({ householdId: null }))).toBe('deferred');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(await stored()).toEqual(check({ householdId: null }));
  });

  it('resolves the household from the cache when not given', async () => {
    qc.setQueryData(queryKeys.household('u1'), 'h9');
    mockCurrencies.mockResolvedValue(['USD']);
    mockRequest.mockResolvedValue([]);
    expect(await ensureRatesForHomeChange(qc, check({ householdId: null }))).toBe('done');
    expect(mockCurrencies).toHaveBeenCalledWith({ fake: true }, 'h9');
  });

  it('null result, rejection, failed household read or throttle -> deferred and persisted; never throws', async () => {
    mockCurrencies.mockResolvedValue(['USD']);
    mockRequest.mockResolvedValue(null);
    expect(await ensureRatesForHomeChange(qc, check())).toBe('deferred');
    expect(await stored()).not.toBeNull();

    await AsyncStorage.clear();
    mockRequest.mockRejectedValue(new Error('offline'));
    expect(await ensureRatesForHomeChange(qc, check())).toBe('deferred');
    expect(await stored()).not.toBeNull();

    await AsyncStorage.clear();
    mockCurrencies.mockRejectedValue(new Error('db'));
    expect(await ensureRatesForHomeChange(qc, check())).toBe('deferred');
    expect(await stored()).not.toBeNull();

    await AsyncStorage.clear();
    mockRequest.mockClear();
    mockCurrencies.mockResolvedValue(['USD']);
    noteResolveRateThrottled();
    expect(await ensureRatesForHomeChange(qc, check())).toBe('deferred');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(await stored()).not.toBeNull();
  });

  it('a newer deferred check overwrites an older one', async () => {
    mockCurrencies.mockRejectedValue(new Error('db'));
    await ensureRatesForHomeChange(qc, check({ homeCurrency: 'JPY' }));
    await ensureRatesForHomeChange(qc, check({ homeCurrency: 'THB' }));
    expect((await stored())?.homeCurrency).toBe('THB');
  });
});

describe('retryOutstandingHomeRateCheck', () => {
  it('does nothing without a record', async () => {
    await retryOutstandingHomeRateCheck(qc, 'u1', createSweepBudget(10));
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('re-runs a record for the session user with the budget; done clears it', async () => {
    await AsyncStorage.setItem(HOME_RATE_CHECK_KEY, JSON.stringify(check()));
    mockCurrencies.mockResolvedValue(['USD']);
    mockRequest.mockResolvedValue([]);
    const budget = createSweepBudget(10);
    await retryOutstandingHomeRateCheck(qc, 'u1', budget);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(budget.remaining).toBe(9);
    expect(await stored()).toBeNull();
  });

  it('nothing-to-fetch clears; deferred keeps', async () => {
    await AsyncStorage.setItem(HOME_RATE_CHECK_KEY, JSON.stringify(check()));
    mockCurrencies.mockResolvedValue([]);
    await retryOutstandingHomeRateCheck(qc, 'u1', createSweepBudget(10));
    expect(await stored()).toBeNull();

    await AsyncStorage.setItem(HOME_RATE_CHECK_KEY, JSON.stringify(check()));
    mockCurrencies.mockResolvedValue(['USD']);
    mockRequest.mockResolvedValue(null);
    await retryOutstandingHomeRateCheck(qc, 'u1', createSweepBudget(10));
    expect(await stored()).toEqual(check());
  });

  it("drops another user's record without a call", async () => {
    await AsyncStorage.setItem(HOME_RATE_CHECK_KEY, JSON.stringify(check({ userId: 'u2' })));
    await retryOutstandingHomeRateCheck(qc, 'u1', createSweepBudget(10));
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockCurrencies).not.toHaveBeenCalled();
    expect(await stored()).toBeNull();
  });

  it('an exhausted budget leaves the record untouched', async () => {
    await AsyncStorage.setItem(HOME_RATE_CHECK_KEY, JSON.stringify(check()));
    await retryOutstandingHomeRateCheck(qc, 'u1', createSweepBudget(0));
    expect(mockRequest).not.toHaveBeenCalled();
    expect(await stored()).toEqual(check());
  });
});

it('wipeDeviceData removes the key', async () => {
  await AsyncStorage.setItem(HOME_RATE_CHECK_KEY, JSON.stringify(check()));
  await wipeDeviceData();
  expect(await AsyncStorage.getItem(HOME_RATE_CHECK_KEY)).toBeNull();
});
