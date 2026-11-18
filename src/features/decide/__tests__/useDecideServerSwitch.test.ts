import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MinVersionClient, MinVersionQueryResult } from '@/features/system/minVersion';
import { DECIDE_OFF_CACHE_KEY, fetchDecideOff, useDecideServerSwitch } from '../useDecideServerSwitch';

type Result = MinVersionQueryResult | Promise<MinVersionQueryResult> | 'throw';

function clientOf(results: Result[]): MinVersionClient {
  let i = 0;
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            const r = results[Math.min(i++, results.length - 1)];
            if (r === 'throw') return Promise.reject(new Error('network'));
            return Promise.resolve(r as MinVersionQueryResult);
          },
        }),
      }),
    }),
  };
}

const ok = (value: string): MinVersionQueryResult => ({ data: { value }, error: null });
const fail: MinVersionQueryResult = { data: null, error: { message: 'boom' } };

const appStateListeners: ((s: string) => void)[] = [];

beforeEach(async () => {
  appStateListeners.length = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
    appStateListeners.push(fn);
    return { remove: jest.fn() };
  }) as unknown as typeof AppState.addEventListener);
  await AsyncStorage.clear();
});

describe('fetchDecideOff', () => {
  it('returns the value, and null on error, empty row, throw and timeout', async () => {
    await expect(fetchDecideOff(clientOf([ok('true')]))).resolves.toBe('true');
    await expect(fetchDecideOff(clientOf([fail]))).resolves.toBeNull();
    await expect(fetchDecideOff(clientOf([{ data: null, error: null }]))).resolves.toBeNull();
    await expect(fetchDecideOff(clientOf(['throw']))).resolves.toBeNull();
    const never = new Promise<MinVersionQueryResult>(() => undefined);
    await expect(fetchDecideOff(clientOf([never]), 10)).resolves.toBeNull();
  });
});

describe('useDecideServerSwitch', () => {
  it('is on when the server says false', async () => {
    const { result } = await renderHook(() => useDecideServerSwitch(clientOf([ok('false')])));
    await waitFor(() => expect(AsyncStorage.getItem(DECIDE_OFF_CACHE_KEY)).resolves.toBe('false'));
    expect(result.current.off).toBe(false);
  });

  it('is off when the server says true, and stores it', async () => {
    const { result } = await renderHook(() => useDecideServerSwitch(clientOf([ok('true')])));
    await waitFor(() => expect(result.current.off).toBe(true));
    await waitFor(() => expect(AsyncStorage.getItem(DECIDE_OFF_CACHE_KEY)).resolves.toBe('true'));
  });

  it('a first-ever failed read means on', async () => {
    const { result } = await renderHook(() => useDecideServerSwitch(clientOf([fail])));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.off).toBe(false);
  });

  it('a failed read keeps the last stored value (off stays off)', async () => {
    await AsyncStorage.setItem(DECIDE_OFF_CACHE_KEY, 'true');
    const { result } = await renderHook(() => useDecideServerSwitch(clientOf([fail])));
    await waitFor(() => expect(result.current.off).toBe(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.off).toBe(true);
  });

  it('a later successful read overrides the stored value', async () => {
    await AsyncStorage.setItem(DECIDE_OFF_CACHE_KEY, 'true');
    const { result } = await renderHook(() => useDecideServerSwitch(clientOf([ok('false')])));
    await waitFor(() => expect(AsyncStorage.getItem(DECIDE_OFF_CACHE_KEY)).resolves.toBe('false'));
    expect(result.current.off).toBe(false);
  });

  it('ignores a stale response that returns after a newer check', async () => {
    let resolveFirst: (r: MinVersionQueryResult) => void = () => undefined;
    const first = new Promise<MinVersionQueryResult>((r) => {
      resolveFirst = r;
    });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    const { result } = await renderHook(() => useDecideServerSwitch(clientOf([first, ok('false')])));
    // Foreground after the refresh window starts a second check.
    jest.setSystemTime(Date.now() + 16 * 60 * 1000);
    await act(async () => {
      appStateListeners.forEach((fn) => fn('active'));
      await Promise.resolve();
    });
    await act(async () => {
      resolveFirst(ok('true'));
      await Promise.resolve();
    });
    expect(result.current.off).toBe(false);
    jest.useRealTimers();
  });
});
