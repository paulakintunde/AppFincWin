/* eslint-disable i18next/no-literal-string -- test doubles */
// 10-27 (T-10-27-01): signed in runs the channel, time-zone, token-refresh and heartbeat bookkeeping; signed out runs nothing;
// notification permission is never requested.
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SystemHosts } from '../SystemHosts';

let mockUser: { id: string } | null = { id: 'u1' };
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }));

const mockEnsure = jest.fn(() => Promise.resolve());
const mockRefresh = jest.fn(() => Promise.resolve(true));
const mockZone = jest.fn();
const mockHeartbeat = jest.fn();
jest.mock('@/features/alerts/channels', () => ({ ensureAlertChannels: () => mockEnsure() }));
jest.mock('@/features/alerts/pushRegistration', () => ({ refreshPushTokenIfGranted: () => mockRefresh() }));
jest.mock('@/features/alerts/useAlertTimeZoneSync', () => ({ useAlertTimeZoneSync: (id?: string) => mockZone(id) }));
jest.mock('@/services/devices/useDeviceHeartbeat', () => ({ useDeviceHeartbeat: (id?: string) => mockHeartbeat(id) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = { id: 'u1' };
});

describe('SystemHosts', () => {
  it('signed in: creates channels, then refreshes the token, and mounts the zone sync and heartbeat', async () => {
    await render(<SystemHosts />);
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(mockEnsure).toHaveBeenCalledTimes(1);
    expect(mockZone).toHaveBeenCalledWith('u1');
    expect(mockHeartbeat).toHaveBeenCalledWith('u1');
  });

  it('signed out: renders nothing and calls nothing', async () => {
    mockUser = null;
    const r = await render(<SystemHosts />);
    expect(r.toJSON()).toBeNull();
    expect(mockEnsure).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockZone).not.toHaveBeenCalled();
    expect(mockHeartbeat).not.toHaveBeenCalled();
  });
});

describe('refreshPushTokenIfGranted', () => {
  const load = (granted: boolean) => {
    jest.resetModules();
    const getPermissionsAsync = jest.fn(() => Promise.resolve({ granted, status: granted ? 'granted' : 'undetermined' }));
    const requestPermissionsAsync = jest.fn();
    const getExpoPushTokenAsync = jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[x]' }));
    const rpc = jest.fn(() => Promise.resolve({}));
    jest.doMock('expo-notifications', () => ({ getPermissionsAsync, requestPermissionsAsync, getExpoPushTokenAsync }));
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'p1' } } } } }));
    jest.doMock('@/services/supabase', () => ({ supabase: { rpc } }));
    jest.doMock('@/features/alerts/channels', () => ({ ensureAlertChannels: jest.fn() }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = jest.requireActual('@/features/alerts/pushRegistration') as typeof import('@/features/alerts/pushRegistration');
    return { mod, requestPermissionsAsync, getExpoPushTokenAsync, rpc };
  };

  it('sends the token when permission is already granted, and never asks', async () => {
    const { mod, requestPermissionsAsync, rpc } = load(true);
    await expect(mod.refreshPushTokenIfGranted()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('register_push_token', expect.objectContaining({ p_token: 'ExponentPushToken[x]' }));
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('does nothing when permission is not granted, and never asks', async () => {
    const { mod, requestPermissionsAsync, getExpoPushTokenAsync, rpc } = load(false);
    await expect(mod.refreshPushTokenIfGranted()).resolves.toBe(false);
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
