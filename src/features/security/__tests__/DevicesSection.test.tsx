// 10-12 (ACC-06/07): the Devices group renders the list, drives revoke for one or all others,
// signs this device out through the normal wipe, and shows the one-hour delay copy.
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DevicesSection } from '../DevicesSection';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

const mockUseDevices = jest.fn();
const mockRevoke = jest.fn();
const mockOthers = jest.fn();
const mockPerformSignOut = jest.fn(async () => undefined);
const mockShowToast = jest.fn();

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('@/features/auth/signOut', () => ({ performSignOut: () => mockPerformSignOut() }));
jest.mock('@/services/devices/useDevices', () => ({
  useDevices: (...a: unknown[]) => mockUseDevices(...a),
  useRevokeDevice: () => ({ mutateAsync: mockRevoke }),
  useSignOutOthers: () => ({ mutateAsync: mockOthers }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockShowToast(...a) }));

jest.setTimeout(20000);

const NOW = new Date().toISOString();
const current = { sessionId: 's1', model: 'Pixel 9', os: 'Android 16', appVersion: '1', lastActive: NOW, signedInAt: '2026-11-01T00:00:00Z', isCurrent: true };
const other = { sessionId: 's2', model: '', os: '', appVersion: '', lastActive: '2026-11-10T10:00:00Z', signedInAt: '2026-11-02T00:00:00Z', isCurrent: false };

function ready(data: unknown[]) {
  mockUseDevices.mockReturnValue({ data, isLoading: false, isError: false, refetch: jest.fn() });
}

async function show() {
  return render(
    <ThemeProvider>
      <DevicesSection />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  mockRevoke.mockResolvedValue(true);
  mockOthers.mockResolvedValue(undefined);
});

describe('DevicesSection', () => {
  it('shows the current device first with a badge, unnamed fallback, and the delay meta', async () => {
    ready([current, other]);
    const { findByText, getByText, queryByText } = await show();
    await findByText('Pixel 9 · Android 16');
    expect(getByText('This device')).toBeTruthy();
    expect(getByText('Unnamed device')).toBeTruthy();
    expect(getByText('Active now')).toBeTruthy();
    expect(getByText('A signed-out device may keep showing records for up to an hour.')).toBeTruthy();
    expect(queryByText(/\d+\.\d+\.\d+\.\d+/)).toBeNull();
  });

  it('shows three skeleton rows while loading', async () => {
    mockUseDevices.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() });
    const { findAllByTestId } = await show();
    expect(await findAllByTestId('device-skeleton')).toHaveLength(3);
  });

  it('shows the try again card on error', async () => {
    const refetch = jest.fn();
    mockUseDevices.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    const { findByText } = await show();
    fireEvent.press(await findByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('revokes another device after confirming', async () => {
    ready([current, other]);
    const { findByText } = await show();
    fireEvent.press(await findByText('Unnamed device'));
    fireEvent.press(await findByText('Sign out of this device'));
    fireEvent.press(await findByText('Sign out'));
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('s2'));
    expect(mockPerformSignOut).not.toHaveBeenCalled();
  });

  it('signs this device out through performSignOut and says the phone copy is cleared', async () => {
    ready([current, other]);
    const { findByText } = await show();
    fireEvent.press(await findByText('Pixel 9 · Android 16'));
    fireEvent.press(await findByText('Sign out of this device'));
    expect(await findByText(/This phone’s copy is cleared/)).toBeTruthy();
    fireEvent.press(await findByText('Sign out'));
    await waitFor(() => expect(mockPerformSignOut).toHaveBeenCalledTimes(1));
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('signs out all other devices and toasts the count', async () => {
    ready([current, other]);
    const { findByText } = await show();
    fireEvent.press(await findByText('Sign out of all other devices'));
    expect(await findByText('1 device will need to sign in again. This device stays signed in.')).toBeTruthy();
    fireEvent.press(await findByText('Sign out others'));
    await waitFor(() => expect(mockOthers).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ text: { key: 'system.security.signedOutOthersToast', params: { count: 1 } } })
      )
    );
  });

  it('disables the all-others row with No other devices when this is the only one', async () => {
    ready([current]);
    const { findByText, getByText } = await show();
    await findByText('Pixel 9 · Android 16');
    expect(getByText('No other devices')).toBeTruthy();
    fireEvent.press(getByText('Sign out of all other devices'));
    expect(mockOthers).not.toHaveBeenCalled();
  });

  it('offline disables the all-others action', async () => {
    onlineManager.setOnline(false);
    ready([current, other]);
    const { findByText } = await show();
    fireEvent.press(await findByText('Sign out of all other devices'));
    expect(mockOthers).not.toHaveBeenCalled();
  });
});
