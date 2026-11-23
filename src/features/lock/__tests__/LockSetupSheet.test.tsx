// 10-21 (UI-SPEC 1a, 1b, D-01, D-33): the setup sheet picks the phone's own lock when the phone has one and the extra
// PIN otherwise; PIN steps match or mismatch; nothing is saved before the last step; the Home offer answers once.
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { LockSetupSheet } from '../LockSetupSheet';
import { LockOfferCard } from '../LockOfferCard';
import * as lockStore from '@/services/lock/lockStore';
import * as biometric from '@/services/lock/biometric';
import { hapticTap } from '@/ui/haptics';

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticWarn: jest.fn(), hapticTick: jest.fn() }));
jest.mock('@/ui/Sheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View: V } = require('react-native');
  return { Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <V>{children}</V> : null) };
});
const mockSetup = { data: { completedAt: '2026-11-01T00:00:00Z' } as { completedAt: string | null } | null };
jest.mock('@/features/levels/useUserSetup', () => ({ useUserSetup: () => ({ data: mockSetup.data, loading: false }) }));
jest.mock('@/services/lock/lockStore', () => ({
  ...jest.requireActual('@/services/lock/lockStore'),
  loadLockState: jest.fn(),
  saveLockSettings: jest.fn(() => Promise.resolve({})),
  setPin: jest.fn(() => Promise.resolve()),
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
const setPin = lockStore.setPin as jest.Mock;
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
  mockSetup.data = { completedAt: '2026-11-01T00:00:00Z' };
  load.mockResolvedValue(lockState());
  kind.mockResolvedValue('faceId');
  available.mockResolvedValue(true);
  authDevice.mockResolvedValue('ok');
  authBio.mockResolvedValue('ok');
});

async function open(props: Partial<React.ComponentProps<typeof LockSetupSheet>> = {}) {
  const onClose = jest.fn();
  const onDone = jest.fn();
  const r = await render(
    <ThemeProvider>
      <LockSetupSheet visible onClose={onClose} onDone={onDone} {...props} />
    </ThemeProvider>
  );
  return { r, onClose, onDone };
}

async function type(r: Awaited<ReturnType<typeof render>>, pin: string) {
  for (const d of pin) await fireEvent.press(r.getByTestId(`pin-key-${d}`));
}

describe('LockSetupSheet, device path (D-33)', () => {
  it('uses the phone lock when the phone has one: no PIN steps', async () => {
    const { r } = await open();
    await waitFor(() => expect(r.getAllByText('Use your phone’s lock to open FincWin').length).toBeGreaterThan(0));
    expect(r.getByText('Face ID, fingerprint or your phone’s passcode will open FincWin.')).toBeTruthy();
    await fireEvent.press(r.getByText('Turn on lock'));
    await waitFor(() => expect(r.getByText('Lock is on')).toBeTruthy());
    expect(r.queryByTestId('pin-pad')).toBeNull();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, lockMethod: 'device', ownerUserId: 'u1', offerAnswered: true }));
    expect(setPin).not.toHaveBeenCalled();
    expect(hapticTap).toHaveBeenCalled();
  });

  it('a cancelled phone prompt leaves the lock off', async () => {
    authDevice.mockResolvedValue('cancel');
    const { r } = await open();
    await waitFor(() => expect(r.getByText('Turn on lock')).toBeTruthy());
    await fireEvent.press(r.getByText('Turn on lock'));
    await waitFor(() => expect(authDevice).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
    expect(r.queryByText('Lock is on')).toBeNull();
  });

  it('a phone with no screen lock is offered the app PIN with the plain line', async () => {
    available.mockResolvedValue(false);
    kind.mockResolvedValue('none');
    const { r } = await open();
    await waitFor(() => expect(r.getByText('This phone has no screen lock. Set a 6-digit PIN for FincWin instead.')).toBeTruthy());
    await fireEvent.press(r.getByText('Turn on lock'));
    await waitFor(() => expect(r.getByTestId('pin-pad')).toBeTruthy());
    expect(authDevice).not.toHaveBeenCalled();
  });

  it('done step: default After 1 minute, Change saves a new timing at once', async () => {
    const { r, onDone, onClose } = await open();
    await waitFor(() => expect(r.getByText('Turn on lock')).toBeTruthy());
    await fireEvent.press(r.getByText('Turn on lock'));
    await waitFor(() => expect(r.getByText('Lock is on')).toBeTruthy());
    expect(r.getByText('After 1 minute')).toBeTruthy();
    await fireEvent.press(r.getByTestId('lock-timing-change'));
    await fireEvent.press(r.getByTestId('lock-timing-fiveMinutes'));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ timing: 'fiveMinutes' }));
    await fireEvent.press(r.getByText('Done'));
    expect(onDone).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('LockSetupSheet, extra FincWin PIN', () => {
  it('biometric explainer first, then PIN twice, then saves appPin', async () => {
    const { r } = await open({ method: 'appPin' });
    await waitFor(() => expect(r.getAllByText('Use Face ID to open FincWin').length).toBeGreaterThan(0));
    await fireEvent.press(r.getByText('Turn on lock'));
    await waitFor(() => expect(r.getByText('Choose a 6-digit PIN')).toBeTruthy());
    await type(r, '123456');
    await waitFor(() => expect(r.getByText('Enter it again')).toBeTruthy());
    expect(save).not.toHaveBeenCalled();
    await type(r, '123456');
    await waitFor(() => expect(r.getByText('Lock is on')).toBeTruthy());
    expect(setPin).toHaveBeenCalledWith('123456');
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, lockMethod: 'appPin', biometric: true, ownerUserId: 'u1' }));
  });

  it('mismatch goes back to the first step with the plain line, no save', async () => {
    kind.mockResolvedValue('none');
    const { r } = await open({ method: 'appPin' });
    await waitFor(() => expect(r.getByText('Choose a 6-digit PIN')).toBeTruthy());
    await type(r, '111111');
    await waitFor(() => expect(r.getByText('Enter it again')).toBeTruthy());
    await type(r, '222222');
    await waitFor(() => expect(r.getByText('The PINs did not match. Try again.')).toBeTruthy());
    expect(r.getByText('Choose a 6-digit PIN')).toBeTruthy();
    expect(setPin).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('a denied biometric prompt continues PIN-only with the plain line', async () => {
    authBio.mockResolvedValue('cancel');
    const { r } = await open({ method: 'appPin' });
    await waitFor(() => expect(r.getByText('Turn on lock')).toBeTruthy());
    await fireEvent.press(r.getByText('Turn on lock'));
    await waitFor(() => expect(r.getByText('Face ID is off for FincWin on this phone. The PIN still works.')).toBeTruthy());
    await type(r, '123456');
    await type(r, '123456');
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ biometric: false, lockMethod: 'appPin' })));
  });

  it('resetPin goes straight to the PIN steps and keeps the biometric choice', async () => {
    load.mockResolvedValue(lockState({ enabled: true, lockMethod: 'appPin', biometric: true }));
    const { r } = await open({ method: 'appPin', resetPin: true });
    await waitFor(() => expect(r.getByText('Choose a 6-digit PIN')).toBeTruthy());
    await type(r, '654321');
    await type(r, '654321');
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ biometric: true, lockMethod: 'appPin' })));
  });

  it('Close before the last step leaves the lock off', async () => {
    kind.mockResolvedValue('none');
    const { r, onClose } = await open({ method: 'appPin' });
    await waitFor(() => expect(r.getByText('Choose a 6-digit PIN')).toBeTruthy());
    await type(r, '111111');
    await fireEvent.press(r.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(setPin).not.toHaveBeenCalled();
  });
});

describe('LockOfferCard (D-01)', () => {
  async function card() {
    return render(
      <ThemeProvider>
        <LockOfferCard />
      </ThemeProvider>
    );
  }

  it('shows the exact Face ID title after setup while the lock is off and unanswered', async () => {
    const r = await card();
    await waitFor(() => expect(r.getByText('Lock FincWin with Face ID?')).toBeTruthy());
    expect(r.getByText('FincWin asks for your phone’s lock when you come back to the app. You can change this in You > Security.')).toBeTruthy();
  });

  it('uses the Touch ID, generic and PIN titles', async () => {
    kind.mockResolvedValue('touchId');
    let r = await card();
    await waitFor(() => expect(r.getByText('Lock FincWin with Touch ID?')).toBeTruthy());
    await r.unmount();
    kind.mockResolvedValue('fingerprint');
    r = await card();
    await waitFor(() => expect(r.getByText('Lock FincWin with your phone’s lock?')).toBeTruthy());
    await r.unmount();
    available.mockResolvedValue(false);
    kind.mockResolvedValue('none');
    r = await card();
    await waitFor(() => expect(r.getByText('Lock FincWin with a PIN?')).toBeTruthy());
  });

  it('is hidden before setup is completed, with the lock on, or once answered', async () => {
    mockSetup.data = { completedAt: null };
    let r = await card();
    await waitFor(() => expect(kind).toHaveBeenCalled());
    expect(r.queryByText(/^Lock FincWin with/)).toBeNull();
    await r.unmount();
    mockSetup.data = { completedAt: '2026-11-01T00:00:00Z' };
    load.mockResolvedValue(lockState({ enabled: true }));
    r = await card();
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(r.queryByText(/^Lock FincWin with/)).toBeNull();
    await r.unmount();
    load.mockResolvedValue(lockState({ offerAnswered: true }));
    r = await card();
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(r.queryByText(/^Lock FincWin with/)).toBeNull();
  });

  it('Not now answers the offer for good', async () => {
    const r = await card();
    await waitFor(() => expect(r.getByText('Lock FincWin with Face ID?')).toBeTruthy());
    load.mockResolvedValue(lockState({ offerAnswered: true }));
    await fireEvent.press(r.getByText('Not now'));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ offerAnswered: true }));
    await waitFor(() => expect(r.queryByTestId('lock-offer')).toBeNull());
  });

  it('Turn on opens the setup sheet', async () => {
    const r = await card();
    await waitFor(() => expect(r.getByText('Turn on')).toBeTruthy());
    await fireEvent.press(r.getByText('Turn on'));
    await waitFor(() => expect(r.getByTestId('lock-setup')).toBeTruthy());
  });
});
