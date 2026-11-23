import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import {
  checkPin,
  clearLock,
  clearPin,
  clearTries,
  DEFAULT_LOCK_SETTINGS,
  loadLockState,
  markBackgrounded,
  registerLockWipe,
  saveLockSettings,
  setPin,
  shouldLockOnActive,
  type LockState,
} from '../lockStore';
import { authenticateBiometric, authenticateDevice, biometricKind, deviceLockAvailable, isBiometricPending } from '../biometric';
import { wipeDeviceData } from '@/services/storage/wipe';

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn((k: string) => Promise.resolve(mockSecure.has(k) ? (mockSecure.get(k) as string) : null)),
  setItemAsync: jest.fn((k: string, v: string) => {
    mockSecure.set(k, v);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((k: string) => {
    mockSecure.delete(k);
    return Promise.resolve();
  }),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  digestStringAsync: jest.fn((_alg: string, s: string) => Promise.resolve(require('crypto').createHash('sha256').update(s).digest('hex'))),
  getRandomBytesAsync: jest.fn((n: number) => Promise.resolve(Uint8Array.from({ length: n }, (_, i) => (i * 11 + 3) % 256))),
}));

const LA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

beforeEach(async () => {
  mockSecure.clear();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('lockStore', () => {
  it('defaults: off, one minute', async () => {
    expect(DEFAULT_LOCK_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_LOCK_SETTINGS.timing).toBe('oneMinute');
    expect(DEFAULT_LOCK_SETTINGS.lockMethod).toBe('device');
    const s = await loadLockState();
    expect(s.settings).toEqual(DEFAULT_LOCK_SETTINGS);
    expect(s.hasPin).toBe(false);
  });

  it('saves settings patches', async () => {
    await saveLockSettings({ enabled: true, timing: 'fiveMinutes', ownerUserId: 'u1' });
    const s = await loadLockState();
    expect(s.settings).toMatchObject({ enabled: true, timing: 'fiveMinutes', ownerUserId: 'u1', biometric: false });
  });

  it('accepts the right PIN and resets tries', async () => {
    await setPin('123456');
    await checkPin('000000', 1000);
    expect((await loadLockState()).wrongTries).toBe(1);
    expect(await checkPin('123456', 2000)).toEqual({ ok: true });
    expect((await loadLockState()).wrongTries).toBe(0);
  });

  it('walks the ladder: 5th wrong try waits 30 s and persists lockUntil', async () => {
    await setPin('123456');
    const now = 10_000;
    for (let i = 1; i <= 4; i++) {
      const r = await checkPin('000000', now);
      expect(r).toMatchObject({ ok: false, backoff: { kind: 'none' }, wrongTries: i });
    }
    const fifth = await checkPin('000000', now);
    expect(fifth).toMatchObject({ ok: false, backoff: { kind: 'wait', ms: 30_000 }, wrongTries: 5 });
    const s = await loadLockState();
    expect(s.lockUntil).toBe(now + 30_000);
    expect(s.wrongTries).toBe(5);
  });

  it('does not count a try while waiting, even with the right PIN', async () => {
    await setPin('123456');
    for (let i = 0; i < 5; i++) await checkPin('000000', 0);
    const r = await checkPin('123456', 10_000);
    expect(r).toEqual({ ok: false, backoff: { kind: 'wait', ms: 20_000 }, wrongTries: 5 });
    expect((await loadLockState()).wrongTries).toBe(5);
    expect(await checkPin('123456', 30_000)).toEqual({ ok: true });
  });

  it('requires re-sign-in at the 10th wrong try', async () => {
    await setPin('123456');
    let now = 0;
    let last: Awaited<ReturnType<typeof checkPin>> | undefined;
    for (let i = 0; i < 10; i++) {
      last = await checkPin('000000', now);
      now += 1_000_000;
    }
    expect(last).toMatchObject({ ok: false, backoff: { kind: 'reauth' }, wrongTries: 10 });
    const after = await checkPin('123456', now);
    expect(after).toMatchObject({ ok: false, backoff: { kind: 'reauth' } });
  });

  it('keeps tries and lockUntil in SecureStore, so clearing AsyncStorage does not reset them', async () => {
    await setPin('123456');
    for (let i = 0; i < 5; i++) await checkPin('000000', 0);
    await AsyncStorage.clear();
    const s = await loadLockState();
    expect(s.wrongTries).toBe(5);
    expect(s.lockUntil).toBe(30_000);
    expect(s.hasPin).toBe(true);
  });

  it('writes lock secrets with WHEN_UNLOCKED_THIS_DEVICE_ONLY and never stores the PIN', async () => {
    await setPin('123456');
    await checkPin('000000', 0);
    const calls = (SecureStore.setItemAsync as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const c of calls) expect(c[2]).toEqual({ keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' });
    for (const k of mockSecure.keys()) expect(k.startsWith('fincwin.lock.')).toBe(true);
    expect([...mockSecure.values()].join('|')).not.toContain('123456');
  });

  it('setPin clears tries and clearTries resets the counter', async () => {
    await setPin('123456');
    for (let i = 0; i < 5; i++) await checkPin('000000', 0);
    await setPin('654321');
    let s = await loadLockState();
    expect(s.wrongTries).toBe(0);
    expect(s.lockUntil).toBeNull();
    await checkPin('000000', 0);
    await clearTries();
    s = await loadLockState();
    expect(s.wrongTries).toBe(0);
  });

  it('clearPin deletes the hash, salt and try counters but keeps the settings', async () => {
    await setPin('123456');
    await saveLockSettings({ enabled: true });
    for (let i = 0; i < 5; i++) await checkPin('000000', 0);
    await clearPin();
    const s = await loadLockState();
    expect(s.hasPin).toBe(false);
    expect(s.wrongTries).toBe(0);
    expect(s.lockUntil).toBeNull();
    expect(mockSecure.has('fincwin.lock.salt')).toBe(false);
    expect(s.settings.enabled).toBe(true);
    expect((await checkPin('123456', 0)).ok).toBe(false);
  });

  it('persists backgroundedAt so a killed app can lock', async () => {
    await markBackgrounded(5000);
    expect((await loadLockState()).backgroundedAt).toBe(5000);
  });

  describe('shouldLockOnActive', () => {
    const st = (over: Partial<LockState['settings']>, backgroundedAt: number | null): LockState => ({
      settings: { ...DEFAULT_LOCK_SETTINGS, enabled: true, ...over },
      hasPin: true,
      wrongTries: 0,
      lockUntil: null,
      backgroundedAt,
    });
    it('is false when disabled', () => {
      expect(shouldLockOnActive(st({ enabled: false }, 0), 1e9, true)).toBe(false);
    });
    it('locks on cold start', () => {
      expect(shouldLockOnActive(st({}, 1000), 1001, true)).toBe(true);
    });
    it('locks when no backgrounded time is recorded', () => {
      expect(shouldLockOnActive(st({}, null), 1001, false)).toBe(true);
    });
    it('respects the one minute timing', () => {
      expect(shouldLockOnActive(st({}, 0), 59_000, false)).toBe(false);
      expect(shouldLockOnActive(st({}, 0), 60_000, false)).toBe(true);
    });
    it('timing now always locks', () => {
      expect(shouldLockOnActive(st({ timing: 'now' }, 1000), 1000, false)).toBe(true);
    });
  });

  it('clearLock removes every lock key and settings; the wipe handler is registered as appLock', async () => {
    await saveLockSettings({ enabled: true });
    await setPin('123456');
    await markBackgrounded(1);
    const unregister = registerLockWipe();
    await wipeDeviceData();
    expect(mockSecure.size).toBe(0);
    expect((await loadLockState()).settings).toEqual(DEFAULT_LOCK_SETTINGS);
    unregister();
    await setPin('123456');
    await clearLock();
    expect(mockSecure.size).toBe(0);
  });
});

describe('biometric', () => {
  const setOs = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });

  it('is none without hardware or enrolment', async () => {
    LA.hasHardwareAsync.mockResolvedValueOnce(false);
    expect(await biometricKind()).toBe('none');
    LA.isEnrolledAsync.mockResolvedValueOnce(false);
    expect(await biometricKind()).toBe('none');
  });

  it('maps types per platform', async () => {
    setOs('ios');
    LA.supportedAuthenticationTypesAsync.mockResolvedValueOnce([2]);
    expect(await biometricKind()).toBe('faceId');
    LA.supportedAuthenticationTypesAsync.mockResolvedValueOnce([1]);
    expect(await biometricKind()).toBe('touchId');
    setOs('android');
    LA.supportedAuthenticationTypesAsync.mockResolvedValueOnce([1]);
    expect(await biometricKind()).toBe('fingerprint');
  });

  it('authenticates with no device fallback and strong level, tracking pending', async () => {
    let resolve!: (v: { success: true }) => void;
    LA.authenticateAsync.mockReturnValueOnce(new Promise((r) => (resolve = r as typeof resolve)));
    const p = authenticateBiometric('Open FincWin', 'Use PIN');
    expect(isBiometricPending()).toBe(true);
    resolve({ success: true });
    expect(await p).toBe('ok');
    expect(isBiometricPending()).toBe(false);
    expect(LA.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        promptMessage: 'Open FincWin',
        cancelLabel: 'Use PIN',
        disableDeviceFallback: true,
        biometricsSecurityLevel: 'strong',
      })
    );
  });

  it('maps cancel and failure', async () => {
    LA.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' } as never);
    expect(await authenticateBiometric('a', 'b')).toBe('cancel');
    LA.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'authentication_failed' } as never);
    expect(await authenticateBiometric('a', 'b')).toBe('fail');
    LA.authenticateAsync.mockRejectedValueOnce(new Error('boom'));
    expect(await authenticateBiometric('a', 'b')).toBe('fail');
    expect(isBiometricPending()).toBe(false);
  });
});

describe('device lock (D-33)', () => {
  it('lockMethod defaults to device, round-trips appPin and ignores junk', async () => {
    expect((await loadLockState()).settings.lockMethod).toBe('device');
    await saveLockSettings({ lockMethod: 'appPin' });
    expect((await loadLockState()).settings.lockMethod).toBe('appPin');
    await AsyncStorage.setItem('fincwin:lock-settings', JSON.stringify({ lockMethod: 'nope' }));
    expect((await loadLockState()).settings.lockMethod).toBe('device');
  });

  it('deviceLockAvailable is true only above SecurityLevel.NONE', async () => {
    LA.getEnrolledLevelAsync.mockResolvedValueOnce(0);
    expect(await deviceLockAvailable()).toBe(false);
    LA.getEnrolledLevelAsync.mockResolvedValueOnce(1);
    expect(await deviceLockAvailable()).toBe(true);
    LA.getEnrolledLevelAsync.mockRejectedValueOnce(new Error('x'));
    expect(await deviceLockAvailable()).toBe(false);
  });

  it('authenticateDevice allows the phone passcode and tracks pending', async () => {
    let resolve!: (v: { success: true }) => void;
    LA.authenticateAsync.mockReturnValueOnce(new Promise((r) => (resolve = r as typeof resolve)));
    const p = authenticateDevice('Open FincWin', 'Cancel');
    expect(isBiometricPending()).toBe(true);
    resolve({ success: true });
    expect(await p).toBe('ok');
    expect(isBiometricPending()).toBe(false);
    const arg = LA.authenticateAsync.mock.calls[0]![0]!;
    expect(arg).toEqual(expect.objectContaining({ promptMessage: 'Open FincWin', cancelLabel: 'Cancel', disableDeviceFallback: false }));
    expect(arg).not.toHaveProperty('biometricsSecurityLevel');
  });

  it('authenticateDevice maps cancel and failure', async () => {
    LA.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' } as never);
    expect(await authenticateDevice('a', 'b')).toBe('cancel');
    LA.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'lockout' } as never);
    expect(await authenticateDevice('a', 'b')).toBe('fail');
    LA.authenticateAsync.mockRejectedValueOnce(new Error('boom'));
    expect(await authenticateDevice('a', 'b')).toBe('fail');
    expect(isBiometricPending()).toBe(false);
  });
});
