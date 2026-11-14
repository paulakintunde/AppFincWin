import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import { wipeDeviceData } from '@/services/storage/wipe';
import {
  HAPTICS_SETTING_KEY,
  getHapticsEnabled,
  hydrateHapticsSetting,
  setHapticsEnabled,
  subscribeHapticsSetting,
  useHapticsEnabled,
} from '../hapticsSetting';

beforeEach(async () => {
  setHapticsEnabled(true);
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('haptics switch store (D-21, D-28)', () => {
  it('is ON before hydration and when nothing is stored', async () => {
    expect(getHapticsEnabled()).toBe(true);
    await hydrateHapticsSetting();
    expect(getHapticsEnabled()).toBe(true);
  });

  it('uses the fincwin: prefix so sign-out wipes it', () => {
    expect(HAPTICS_SETTING_KEY).toBe('fincwin:haptics-enabled');
  });

  it('setHapticsEnabled(false) updates at once, notifies and persists', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeHapticsSetting(listener);
    setHapticsEnabled(false);
    expect(getHapticsEnabled()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(await AsyncStorage.getItem(HAPTICS_SETTING_KEY)).toBe('false');
    unsubscribe();
    setHapticsEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('hydrate reads a stored false and turns the switch off', async () => {
    await AsyncStorage.setItem(HAPTICS_SETTING_KEY, 'false');
    await hydrateHapticsSetting();
    expect(getHapticsEnabled()).toBe(false);
  });

  it('hydrate leaves the switch ON for a junk value', async () => {
    await AsyncStorage.setItem(HAPTICS_SETTING_KEY, 'nope');
    await hydrateHapticsSetting();
    expect(getHapticsEnabled()).toBe(true);
  });

  it('hydrate leaves the switch ON when the read fails', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await expect(hydrateHapticsSetting()).resolves.toBeUndefined();
    expect(getHapticsEnabled()).toBe(true);
  });

  it('a failed write does not throw and keeps the in-memory value', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
    expect(() => setHapticsEnabled(false)).not.toThrow();
    await Promise.resolve();
    expect(getHapticsEnabled()).toBe(false);
  });

  it('useHapticsEnabled returns [enabled, setEnabled] and re-renders on change', () => {
    const { result } = renderHook(() => useHapticsEnabled());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    act(() => setHapticsEnabled(true));
    expect(result.current[0]).toBe(true);
  });

  it('is ON again after the device wipe runs', async () => {
    setHapticsEnabled(false);
    await wipeDeviceData();
    expect(getHapticsEnabled()).toBe(true);
    expect(await AsyncStorage.getItem(HAPTICS_SETTING_KEY)).toBeNull();
  });
});
