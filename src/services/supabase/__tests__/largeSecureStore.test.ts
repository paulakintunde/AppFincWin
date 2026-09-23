// react-native-get-random-values falls back to a native module that doesn't exist under
// Jest; define global.crypto from Node's webcrypto before the module under test (which
// imports react-native-get-random-values for its side effect) is required.
// eslint-disable-next-line @typescript-eslint/no-require-imports
global.crypto = require('crypto').webcrypto;

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LargeSecureStore } from '../largeSecureStore';

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

const secureStoreMap = () => (SecureStore as unknown as { __store: Map<string, string> }).__store;

describe('LargeSecureStore', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    secureStoreMap().clear();
    jest.clearAllMocks();
  });

  it('round-trips a 5,000-char string', async () => {
    const store = new LargeSecureStore();
    const value = 'x'.repeat(5000);

    await store.setItem('session', value);
    const result = await store.getItem('session');

    expect(result).toBe(value);
  });

  it('does not store the plaintext, and stores "<32 hex iv>:<hex cipher>"', async () => {
    const store = new LargeSecureStore();
    await store.setItem('session', 'super-secret-token-value');

    const raw = await AsyncStorage.getItem('session');
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('super-secret-token-value');
    expect(raw).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/i);
  });

  it('produces different ciphertexts for two setItem calls with the same value', async () => {
    const store = new LargeSecureStore();
    await store.setItem('session', 'same-value');
    const first = await AsyncStorage.getItem('session');

    await store.setItem('session', 'same-value');
    const second = await AsyncStorage.getItem('session');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);

    const [firstIv] = (first as string).split(':');
    const [secondIv] = (second as string).split(':');
    expect(firstIv).not.toBe(secondIv);
  });

  it('gives SecureStore only a 64-hex-char key, never the value', async () => {
    const store = new LargeSecureStore();
    await store.setItem('session', 'super-secret-token-value');

    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
    const [, storedKeyValue] = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
    expect(storedKeyValue).toMatch(/^[0-9a-f]{64}$/i);
    expect(storedKeyValue).not.toContain('super-secret-token-value');
  });

  it('returns null for a missing key', async () => {
    const store = new LargeSecureStore();
    expect(await store.getItem('does-not-exist')).toBeNull();
  });

  it('removeItem deletes both the AsyncStorage blob and the SecureStore key', async () => {
    const store = new LargeSecureStore();
    await store.setItem('session', 'value');

    await store.removeItem('session');

    expect(await AsyncStorage.getItem('session')).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('session.k');
  });

  it('returns null and removes a corrupted blob (bad format) rather than throwing', async () => {
    const store = new LargeSecureStore();
    await AsyncStorage.setItem('session', 'not-a-valid-blob');

    const result = await store.getItem('session');

    expect(result).toBeNull();
    expect(await AsyncStorage.getItem('session')).toBeNull();
  });
});
