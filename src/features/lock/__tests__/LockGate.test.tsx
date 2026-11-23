// 10-21 (ACC-08, ACC-09, DSG-08, D-03, D-29, D-33): the gate unmounts the app while locked, device mode shows Unlock with
// no pad, app-PIN mode keeps the pad, the wait ladder and the re-sign-in, and the cover always shows.
import React from 'react';
import { AppState, BackHandler, Text as RNText } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { LockGate } from '../LockGate';
import * as lockStore from '@/services/lock/lockStore';
import * as biometric from '@/services/lock/biometric';
import { hapticTap, hapticWarn } from '@/ui/haptics';
import { performSignOut, requestSignOut } from '@/features/auth/signOut';

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.mock('expo-splash-screen', () => ({ hideAsync: jest.fn(() => Promise.resolve()) }));

const mockAuth = { status: 'signedIn' as 'signedIn' | 'signedOut' | 'loading', signInWithApple: jest.fn(), signInWithGoogle: jest.fn() };
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/config/env', () => ({ getEnv: () => ({ appleSignInEnabled: true }) }));
jest.mock('@/features/auth/signOut', () => ({
  performSignOut: jest.fn(() => Promise.resolve()),
  requestSignOut: jest.fn(() => Promise.resolve({ needsConfirm: false })),
}));
jest.mock('@/features/auth/AppleSignInButton', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable: P, Text: T } = require('react-native');
  return { AppleSignInButton: ({ onPress }: { onPress: () => void }) => <P testID="apple" onPress={onPress}><T>Apple</T></P> };
});
jest.mock('@/features/auth/GoogleSignInButton', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable: P, Text: T } = require('react-native');
  return { GoogleSignInButton: ({ onPress }: { onPress: () => void }) => <P testID="google" onPress={onPress}><T>Google</T></P> };
});
const mockGetSession = jest.fn();
jest.mock('../currentUser', () => ({
  currentUserId: async () => (await mockGetSession()).data.session?.user.id ?? null,
}));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticWarn: jest.fn(), hapticTick: jest.fn() }));
jest.mock('@/ui/ConfirmSheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable: P, Text: T, View: V } = require('react-native');
  return {
    ConfirmSheet: ({ visible, title, body, confirmLabel, onConfirm, onCancel }: Record<string, unknown>) =>
      visible ? (
        <V testID={`confirm-${String(title ?? body).slice(0, 12)}`}>
          <T>{String(title ?? '')}</T>
          <P testID={`confirm-ok-${String(title ?? body).slice(0, 12)}`} onPress={onConfirm as () => void}><T>{String(confirmLabel)}</T></P>
          <P testID="confirm-cancel" onPress={onCancel as () => void}><T>cancel</T></P>
        </V>
      ) : null,
  };
});
jest.mock('../LockSetupSheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View: V } = require('react-native');
  return { LockSetupSheet: ({ visible }: { visible: boolean }) => (visible ? <V testID="setup-open" /> : null) };
});
jest.mock('@/services/lock/lockStore', () => ({
  ...jest.requireActual('@/services/lock/lockStore'),
  loadLockState: jest.fn(),
  checkPin: jest.fn(),
  clearTries: jest.fn(() => Promise.resolve()),
  markBackgrounded: jest.fn(() => Promise.resolve()),
  registerLockWipe: jest.fn(() => () => undefined),
}));
jest.mock('@/services/lock/biometric', () => ({
  isBiometricPending: jest.fn(() => false),
  biometricKind: jest.fn(() => Promise.resolve('faceId')),
  authenticateBiometric: jest.fn(() => Promise.resolve('cancel')),
  authenticateDevice: jest.fn(() => Promise.resolve('cancel')),
  deviceLockAvailable: jest.fn(() => Promise.resolve(true)),
}));

const load = lockStore.loadLockState as jest.Mock;
const checkPin = lockStore.checkPin as jest.Mock;
const clearTries = lockStore.clearTries as jest.Mock;
const authDevice = biometric.authenticateDevice as jest.Mock;
const authBio = biometric.authenticateBiometric as jest.Mock;

const state = (over: Partial<lockStore.LockSettings> = {}, extra: Partial<lockStore.LockState> = {}): lockStore.LockState => ({
  settings: { ...lockStore.DEFAULT_LOCK_SETTINGS, enabled: true, ownerUserId: 'u1', ...over },
  hasPin: true,
  wrongTries: 0,
  lockUntil: null,
  backgroundedAt: null,
  ...extra,
});

function Child() {
  return <RNText testID="app-content">app</RNText>;
}

async function show() {
  return render(
    <ThemeProvider>
      <LockGate>
        <Child />
      </LockGate>
    </ThemeProvider>
  );
}

async function typePin(r: Awaited<ReturnType<typeof show>>, pin: string) {
  for (const d of pin) await fireEvent.press(r.getByTestId(`pin-key-${d}`));
}

let appStateHandler: (s: string) => void = () => undefined;
let backHandler: () => boolean = () => false;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.status = 'signedIn';
  authDevice.mockResolvedValue('cancel');
  authBio.mockResolvedValue('cancel');
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => {
    appStateHandler = h;
    return { remove: jest.fn() };
  }) as never);
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_: string, h: () => boolean) => {
    backHandler = h;
    return { remove: jest.fn() };
  }) as never);
});

describe('LockGate, device mode (D-33)', () => {
  it('cold start: shows the lock, unmounts the app, shows Unlock and no pad, opens the prompt once', async () => {
    load.mockResolvedValue(state({ lockMethod: 'device' }));
    const r = await show();
    await waitFor(() => expect(r.getByTestId('lock-device')).toBeTruthy());
    expect(r.queryByTestId('app-content')).toBeNull();
    expect(r.queryByTestId('pin-pad')).toBeNull();
    expect(r.getByText('Unlock')).toBeTruthy();
    expect(r.getByText('Sign out')).toBeTruthy();
    expect(authDevice).toHaveBeenCalledTimes(1);
  });

  it('cancel leaves the lock up; Unlock runs the prompt again and success opens the app', async () => {
    load.mockResolvedValue(state({ lockMethod: 'device' }));
    const r = await show();
    await waitFor(() => expect(authDevice).toHaveBeenCalledTimes(1));
    expect(r.queryByTestId('app-content')).toBeNull();
    authDevice.mockResolvedValueOnce('ok');
    await fireEvent.press(r.getByText('Unlock'));
    await waitFor(() => expect(r.getByTestId('app-content')).toBeTruthy());
    expect(hapticTap).toHaveBeenCalled();
  });

  it('has no Forgot PIN link and never uses the PIN services', async () => {
    load.mockResolvedValue(state({ lockMethod: 'device' }));
    const r = await show();
    await waitFor(() => expect(r.getByTestId('lock-device')).toBeTruthy());
    expect(r.queryByText('Forgot PIN?')).toBeNull();
    expect(checkPin).not.toHaveBeenCalled();
  });
});

describe('LockGate, app-PIN mode', () => {
  beforeEach(() => load.mockResolvedValue(state({ lockMethod: 'appPin', biometric: false })));

  it('shows the pad; the correct sixth digit unlocks with one tap haptic', async () => {
    checkPin.mockResolvedValue({ ok: true });
    const r = await show();
    await waitFor(() => expect(r.getByTestId('pin-pad')).toBeTruthy());
    expect(r.queryByTestId('app-content')).toBeNull();
    await typePin(r, '123456');
    await waitFor(() => expect(r.getByTestId('app-content')).toBeTruthy());
    expect(hapticTap).toHaveBeenCalledTimes(1);
  });

  it('wrong try 1-4: clears dots, says how many tries are left, one warn haptic', async () => {
    checkPin.mockResolvedValue({ ok: false, backoff: { kind: 'none' }, wrongTries: 2 });
    const r = await show();
    await waitFor(() => expect(r.getByTestId('pin-pad')).toBeTruthy());
    await typePin(r, '111111');
    await waitFor(() => expect(r.getByText('That PIN is not right. 3 tries left before a short wait.')).toBeTruthy());
    expect(r.queryAllByTestId('pin-dot-filled')).toHaveLength(0);
    expect(hapticWarn).toHaveBeenCalledTimes(1);
  });

  it('5th wrong: pad disabled, Locked badge and a countdown heading', async () => {
    checkPin.mockResolvedValue({ ok: false, backoff: { kind: 'wait', ms: 30_000 }, wrongTries: 5 });
    const r = await show();
    await waitFor(() => expect(r.getByTestId('pin-pad')).toBeTruthy());
    await typePin(r, '111111');
    await waitFor(() => expect(r.getByText('Try again in 0:30')).toBeTruthy());
    expect(r.getByText('Locked')).toBeTruthy();
    const key = r.getByTestId('pin-key-1');
    expect(key.props.accessibilityState?.disabled ?? key.props['aria-disabled']).toBeTruthy();
  });

  it('10th wrong: Sign in again; the same person keeps the phone copy and sets a new PIN', async () => {
    checkPin.mockResolvedValue({ ok: false, backoff: { kind: 'reauth' }, wrongTries: 10 });
    mockAuth.signInWithApple.mockResolvedValue({ status: 'signedIn' });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    const r = await show();
    await waitFor(() => expect(r.getByTestId('pin-pad')).toBeTruthy());
    await typePin(r, '111111');
    await waitFor(() => expect(r.getByTestId('lock-reauth')).toBeTruthy());
    expect(r.getByText('Sign in again')).toBeTruthy();
    await fireEvent.press(r.getByTestId('apple'));
    await waitFor(() => expect(r.getByTestId('setup-open')).toBeTruthy());
    expect(clearTries).toHaveBeenCalled();
    expect(performSignOut).not.toHaveBeenCalled();
  });

  it('10th wrong: a different person gets the normal sign-out wipe', async () => {
    load.mockResolvedValue(state({ lockMethod: 'appPin' }, { wrongTries: 10 }));
    mockAuth.signInWithGoogle.mockResolvedValue({ status: 'signedIn' });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'someone-else' } } } });
    const r = await show();
    await waitFor(() => expect(r.getByTestId('lock-reauth')).toBeTruthy());
    await fireEvent.press(r.getByTestId('google'));
    await waitFor(() => expect(performSignOut).toHaveBeenCalledTimes(1));
    expect(clearTries).not.toHaveBeenCalled();
  });

  it('Forgot PIN asks first, then shows the sign-in again state', async () => {
    const r = await show();
    await waitFor(() => expect(r.getByTestId('pin-pad')).toBeTruthy());
    await fireEvent.press(r.getByText('Forgot PIN?'));
    await fireEvent.press(r.getByTestId('confirm-ok-Sign in agai'));
    await waitFor(() => expect(r.getByTestId('lock-reauth')).toBeTruthy());
  });
});

describe('LockGate, everything else', () => {
  it('Sign out footer asks, then uses the normal sign-out path', async () => {
    load.mockResolvedValue(state({ lockMethod: 'device' }));
    const r = await show();
    await waitFor(() => expect(r.getByTestId('lock-device')).toBeTruthy());
    await fireEvent.press(r.getByText('Sign out'));
    await fireEvent.press(r.getByTestId('confirm-ok-Sign out?'));
    await waitFor(() => expect(requestSignOut).toHaveBeenCalledTimes(1));
  });

  it('lock off: the app renders directly and the cover still shows on background', async () => {
    load.mockResolvedValue(state({ enabled: false }));
    const r = await show();
    await waitFor(() => expect(r.getByTestId('app-content')).toBeTruthy());
    expect(r.queryByTestId('app-cover', { includeHiddenElements: true })).toBeNull();
    await act(async () => appStateHandler('inactive'));
    expect(r.getByTestId('app-cover', { includeHiddenElements: true })).toBeTruthy();
    expect(r.getByTestId('app-content')).toBeTruthy();
    await act(async () => appStateHandler('active'));
    expect(r.queryByTestId('app-cover', { includeHiddenElements: true })).toBeNull();
  });

  it('signed out: pass-through, no lock screen', async () => {
    mockAuth.status = 'signedOut';
    load.mockResolvedValue(state({ lockMethod: 'device' }));
    const r = await show();
    await waitFor(() => expect(r.getByTestId('app-content')).toBeTruthy());
    expect(r.queryByTestId('lock-device')).toBeNull();
  });

  it('Android back is consumed on the lock screen and never reveals the app', async () => {
    load.mockResolvedValue(state({ lockMethod: 'device' }));
    const r = await show();
    await waitFor(() => expect(r.getByTestId('lock-device')).toBeTruthy());
    expect(backHandler()).toBe(true);
    expect(r.queryByTestId('app-content')).toBeNull();
  });

  it('shows no amount or currency on the lock screen', async () => {
    load.mockResolvedValue(state({ lockMethod: 'device' }));
    const r = await show();
    await waitFor(() => expect(r.getByTestId('lock-device')).toBeTruthy());
    expect(r.queryByText(/[$£€]/)).toBeNull();
  });
});
