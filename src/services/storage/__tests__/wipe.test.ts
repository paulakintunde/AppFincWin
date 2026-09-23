import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  STORAGE_PREFIX,
  registerWipeHandler,
  registerSecureKey,
  getPendingWriteCount,
  wipeDeviceData,
} from '../wipe';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  };
});

describe('wipe registry', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    (SecureStore as unknown as { __store: Map<string, string> }).__store.clear();
    jest.clearAllMocks();
  });

  describe('getPendingWriteCount', () => {
    it('is 0 with no registered providers', async () => {
      expect(await getPendingWriteCount()).toBe(0);
    });

    it('sums every provider', async () => {
      const unregisterA = registerWipeHandler({
        id: 'a',
        wipe: jest.fn(),
        pendingWriteCount: async () => 1,
      });
      const unregisterB = registerWipeHandler({
        id: 'b',
        wipe: jest.fn(),
        pendingWriteCount: async () => 2,
      });

      expect(await getPendingWriteCount()).toBe(3);

      unregisterA();
      unregisterB();
    });

    it('treats a provider with no pendingWriteCount as 0', async () => {
      const unregister = registerWipeHandler({ id: 'c', wipe: jest.fn() });
      expect(await getPendingWriteCount()).toBe(0);
      unregister();
    });
  });

  describe('registerWipeHandler', () => {
    it('returns an unregister function that stops the handler from running', async () => {
      const wipe = jest.fn().mockResolvedValue(undefined);
      const unregister = registerWipeHandler({ id: 'unreg-me', wipe });
      unregister();

      await wipeDeviceData();

      expect(wipe).not.toHaveBeenCalled();
    });
  });

  describe('wipeDeviceData', () => {
    it('runs every registered handler wipe()', async () => {
      const wipeA = jest.fn().mockResolvedValue(undefined);
      const wipeB = jest.fn().mockResolvedValue(undefined);
      const unregisterA = registerWipeHandler({ id: 'wipe-a', wipe: wipeA });
      const unregisterB = registerWipeHandler({ id: 'wipe-b', wipe: wipeB });

      await wipeDeviceData();

      expect(wipeA).toHaveBeenCalledTimes(1);
      expect(wipeB).toHaveBeenCalledTimes(1);

      unregisterA();
      unregisterB();
    });

    it('deletes every SecureStore key recorded via registerSecureKey', async () => {
      await registerSecureKey('session.k');
      await registerSecureKey('other.k');
      await SecureStore.setItemAsync('session.k', 'deadbeef');
      await SecureStore.setItemAsync('other.k', 'cafebabe');

      await wipeDeviceData();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('session.k');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('other.k');
    });

    it('removes every fincwin: AsyncStorage key and leaves other keys alone', async () => {
      await AsyncStorage.setItem(`${STORAGE_PREFIX}auth`, 'x');
      await AsyncStorage.setItem(`${STORAGE_PREFIX}cache`, 'y');
      await AsyncStorage.setItem('unrelated-key', 'z');

      await wipeDeviceData();

      expect(await AsyncStorage.getItem(`${STORAGE_PREFIX}auth`)).toBeNull();
      expect(await AsyncStorage.getItem(`${STORAGE_PREFIX}cache`)).toBeNull();
      expect(await AsyncStorage.getItem('unrelated-key')).toBe('z');
    });

    it('removes the secure-key index itself, since it is a fincwin: key', async () => {
      await registerSecureKey('session.k');

      await wipeDeviceData();

      expect(await AsyncStorage.getItem(`${STORAGE_PREFIX}secure-key-index`)).toBeNull();
    });

    it('lets the rest run when one handler throws, then rejects with an AggregateError', async () => {
      const wipeGood = jest.fn().mockResolvedValue(undefined);
      const unregisterGood = registerWipeHandler({ id: 'good', wipe: wipeGood });
      const unregisterBad = registerWipeHandler({
        id: 'bad',
        wipe: jest.fn().mockRejectedValue(new Error('boom')),
      });
      await AsyncStorage.setItem(`${STORAGE_PREFIX}auth`, 'x');

      await expect(wipeDeviceData()).rejects.toBeInstanceOf(AggregateError);

      expect(wipeGood).toHaveBeenCalledTimes(1);
      // Steps after the failing handler still ran.
      expect(await AsyncStorage.getItem(`${STORAGE_PREFIX}auth`)).toBeNull();

      unregisterGood();
      unregisterBad();
    });
  });

  describe('wipeDeviceData error resilience', () => {
    it('collects a SecureStore deletion failure and keeps running remaining steps', async () => {
      await registerSecureKey('will-fail.k');
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain error'));
      await AsyncStorage.setItem(`${STORAGE_PREFIX}auth`, 'x');

      await expect(wipeDeviceData()).rejects.toBeInstanceOf(AggregateError);

      expect(await AsyncStorage.getItem(`${STORAGE_PREFIX}auth`)).toBeNull();
    });

    it('collects an AsyncStorage read/remove failure without throwing synchronously', async () => {
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('storage error'));

      await expect(wipeDeviceData()).rejects.toBeInstanceOf(AggregateError);
    });

    it('treats a corrupted secure-key index as empty rather than throwing', async () => {
      await AsyncStorage.setItem(`${STORAGE_PREFIX}secure-key-index`, 'not-json{{');

      await expect(wipeDeviceData()).resolves.toBeUndefined();
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    });
  });

  describe('registerSecureKey', () => {
    it('is idempotent for the same name', async () => {
      await registerSecureKey('dup.k');
      await registerSecureKey('dup.k');
      await SecureStore.setItemAsync('dup.k', 'value');

      await wipeDeviceData();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('dup.k');
      expect((SecureStore.deleteItemAsync as jest.Mock).mock.calls.filter((c) => c[0] === 'dup.k')).toHaveLength(1);
    });
  });
});
