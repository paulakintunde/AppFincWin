/* eslint-disable i18next/no-literal-string -- test doubles render fixed words */
// 10-21 (ACC-08, ACC-09, UI-SPEC 2, D-02, D-33): the Phone lock group. Device mode by default, timing saves at once, the
// extra PIN row and Change PIN exist only where they apply, and turning the lock off asks first.
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { LockSection } from '../LockSection';
import * as lockStore from '@/services/lock/lockStore';
import * as biometric from '@/services/lock/biometric';
import { hapticTick } from '@/ui/haptics';
import { showToast } from '@/state/undoToast';

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticWarn: jest.fn(), hapticTick: jest.fn() }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/lock/LockSetupSheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: T } = require('react-native');
  return { LockSetupSheet: ({ visible, method, resetPin }: Record<string, unknown>) => (visible ? <T testID="setup">{`${String(method)}:${String(resetPin)}`}</T> : null) };
});
jest.mock('@/features/lock/PinCheckSheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable: P, Text: T } = require('react-native');
  return { PinCheckSheet: ({ visible, onVerified }: { visible: boolean; onVerified: () => void }) => (visible ? <P testID="pin-check" onPress={onVerified}><T>check</T></P> : null) };
});
jest.mock('@/services/lock/lockStore', () => ({
  ...jest.requireActual('@/services/lock/lockStore'),
  loadLockState: jest.fn(),
  saveLockSettings: jest.fn(() => Promise.resolve({})),
  clearTries: jest.fn(() => Promise.resolve()),
  clearPin: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/services/lock/biometric', () => ({
  biometricKind: jest.fn(),
  deviceLockAvailable: jest.fn(),
  authenticateDevice: jest.fn(),
  authenticateBiometric: jest.fn(),
  isBiometricPending: jest.fn(() => false),
}));

const load = lockStore.loadLockState as jest.Mock;
const save = lockStore.saveLockSettings as jest.Mock;
const kind = biometric.biometricKind as jest.Mock;
const available = biometric.deviceLockAvailable as jest.Mock;
const authDevice = biometric.authenticateDevice as jest.Mock;
const authBio = biometric.authenticateBiometric as jest.Mock;

const lockState = (over: Partial<lockStore.LockSettings> = {}): lockStore.LockState => ({
  settings: { ...lockStore.DEFAULT_LOCK_SETTINGS, ...over },
  hasPin: false,
  wrongTries: 0,
  lockUntil: null,
  backgroundedAt: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  load.mockResolvedValue(lockState());
  kind.mockResolvedValue('faceId');
  available.mockResolvedValue(true);
  authDevice.mockResolvedValue('ok');
  authBio.mockResolvedValue('ok');
});

async function show() {
  return render(
    <ThemeProvider>
      <LockSection />
    </ThemeProvider>
  );
}

describe('LockSection', () => {
  it('off: shows only the Lock FincWin switch and the scope line; turning it on opens setup', async () => {
    const r = await show();
    await waitFor(() => expect(r.getByLabelText('Lock FincWin, switch off')).toBeTruthy());
    expect(r.queryByText('Ask for it')).toBeNull();
    expect(r.getByText('The lock covers this phone only. It does not change who can see your records.')).toBeTruthy();
    await fireEvent.press(r.getByLabelText('Lock FincWin, switch off'));
    await waitFor(() => expect(r.getByTestId('setup')).toBeTruthy());
    expect(r.getByTestId('setup').props.children).toBe('auto:false');
  });

  it('device mode on: four timing rows with After 1 minute selected; no Change PIN and no Face ID toggle', async () => {
    load.mockResolvedValue(lockState({ enabled: true, lockMethod: 'device' }));
    const r = await show();
    await waitFor(() => expect(r.getByLabelText('Lock FincWin, switch on')).toBeTruthy());
    for (const w of ['Right away', 'After 1 minute', 'After 5 minutes', 'After 15 minutes']) expect(r.getByText(w)).toBeTruthy();
    const one = r.getByLabelText('After 1 minute');
    expect(one.props.accessibilityState?.selected ?? one.props['aria-selected']).toBe(true);
    expect(r.queryByText('Change PIN')).toBeNull();
    expect(r.queryByText('Face ID')).toBeNull();
    expect(r.getByText('Extra FincWin PIN')).toBeTruthy();
    expect(r.getByText('Ask for a separate 6-digit PIN instead of your phone’s lock')).toBeTruthy();
  });

  it('choosing a timing saves at once with a tick', async () => {
    load.mockResolvedValue(lockState({ enabled: true }));
    const r = await show();
    await waitFor(() => expect(r.getByText('After 15 minutes')).toBeTruthy());
    await fireEvent.press(r.getByText('After 15 minutes'));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ timing: 'fifteenMinutes' }));
    expect(hapticTick).toHaveBeenCalled();
  });

  it('turning the lock off asks the phone first, then saves and toasts', async () => {
    load.mockResolvedValue(lockState({ enabled: true }));
    const r = await show();
    await waitFor(() => expect(r.getByLabelText('Lock FincWin, switch on')).toBeTruthy());
    await fireEvent.press(r.getByLabelText('Lock FincWin, switch on'));
    await waitFor(() => expect(authDevice).toHaveBeenCalled());
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ enabled: false })));
    expect(showToast).toHaveBeenCalledWith({ kind: 'ordinary', text: { key: 'system.appLock.lockIsOffToast' } });
  });

  it('a refused check leaves the lock on', async () => {
    load.mockResolvedValue(lockState({ enabled: true }));
    authDevice.mockResolvedValue('cancel');
    const r = await show();
    await waitFor(() => expect(r.getByLabelText('Lock FincWin, switch on')).toBeTruthy());
    await fireEvent.press(r.getByLabelText('Lock FincWin, switch on'));
    await waitFor(() => expect(authDevice).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('Extra FincWin PIN on opens the PIN setup', async () => {
    load.mockResolvedValue(lockState({ enabled: true }));
    const r = await show();
    await waitFor(() => expect(r.getByText('Extra FincWin PIN')).toBeTruthy());
    await fireEvent.press(r.getByText('Extra FincWin PIN'));
    await waitFor(() => expect(r.getByTestId('setup').props.children).toBe('appPin:false'));
  });

  it('app-PIN mode: Change PIN and the Face ID toggle show; Change PIN asks for the PIN then runs the PIN steps', async () => {
    load.mockResolvedValue(lockState({ enabled: true, lockMethod: 'appPin', biometric: true }));
    const r = await show();
    await waitFor(() => expect(r.getByText('Change PIN')).toBeTruthy());
    expect(r.getByText('Face ID')).toBeTruthy();
    await fireEvent.press(r.getByText('Change PIN'));
    await fireEvent.press(r.getByTestId('pin-check'));
    await waitFor(() => expect(r.getByTestId('setup').props.children).toBe('appPin:true'));
  });

  it('turning the extra PIN off asks for the PIN, then returns to the phone lock', async () => {
    load.mockResolvedValue(lockState({ enabled: true, lockMethod: 'appPin' }));
    const r = await show();
    await waitFor(() => expect(r.getByText('Extra FincWin PIN')).toBeTruthy());
    await fireEvent.press(r.getByText('Extra FincWin PIN'));
    await fireEvent.press(r.getByTestId('pin-check'));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ lockMethod: 'device', biometric: false }));
    expect(lockStore.clearPin).toHaveBeenCalledTimes(1);
  });

  it('shows the app-switcher meta line', async () => {
    const r = await show();
    await waitFor(() => expect(r.getByText('FincWin always shows a plain screen in the app switcher, even with the lock off.')).toBeTruthy());
  });
});
