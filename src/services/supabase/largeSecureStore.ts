// ACC-12: expo-secure-store's practical ceiling (~2048 bytes) is smaller than a Supabase
// session (JWT + refresh token). This adapter generates a 256-bit AES key, stores that key
// (small) in SecureStore, encrypts the actual value with aes-js in CTR mode, and stores the
// encrypted blob in AsyncStorage (unbounded size, useless without the key).
//
// Must import before any crypto use, so `crypto.getRandomValues` is a CSPRNG rather than
// missing entirely.
import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import { registerSecureKey } from '@/services/storage/wipe';

const BLOB_FORMAT = /^[0-9a-f]{32}:[0-9a-f]+$/i;

function toHex(bytes: Uint8Array): string {
  return aesjs.utils.hex.fromBytes(bytes);
}

function fromHex(hex: string): Uint8Array {
  return aesjs.utils.hex.toBytes(hex);
}

export class LargeSecureStore {
  private secureKeyName(key: string): string {
    return `${key.replace(/[^A-Za-z0-9._-]/g, '_')}.k`;
  }

  private async getOrCreateKey(key: string): Promise<Uint8Array> {
    const name = this.secureKeyName(key);
    const existing = await SecureStore.getItemAsync(name);
    if (existing) {
      return fromHex(existing);
    }

    const keyBytes = new Uint8Array(32);
    crypto.getRandomValues(keyBytes);
    await SecureStore.setItemAsync(name, toHex(keyBytes), {
      // Keeps the key out of iCloud Keychain / Android account backups — it never needs
      // to survive a device restore, only this device's lifetime.
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await registerSecureKey(name);
    return keyBytes;
  }

  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;

    if (!BLOB_FORMAT.test(stored)) {
      await this.removeItem(key);
      return null;
    }

    const separatorIndex = stored.indexOf(':');
    const ivHex = stored.slice(0, separatorIndex);
    const cipherHex = stored.slice(separatorIndex + 1);

    try {
      const keyBytes = await this.getOrCreateKey(key);
      const iv = fromHex(ivHex);
      const cipherBytes = fromHex(cipherHex);
      const aesCtr = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(iv));
      const decryptedBytes = aesCtr.decrypt(cipherBytes);
      return aesjs.utils.utf8.fromBytes(decryptedBytes);
    } catch {
      await this.removeItem(key);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const keyBytes = await this.getOrCreateKey(key);

    // Fresh random 16-byte IV/counter per write. Reusing a CTR counter under the same key
    // leaks the XOR of the two plaintexts when the two ciphertexts are XORed together.
    const iv = new Uint8Array(16);
    crypto.getRandomValues(iv);

    const valueBytes = aesjs.utils.utf8.toBytes(value);
    const aesCtr = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(iv));
    const cipherBytes = aesCtr.encrypt(valueBytes);

    await AsyncStorage.setItem(key, `${toHex(iv)}:${toHex(cipherBytes)}`);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(this.secureKeyName(key));
  }
}
