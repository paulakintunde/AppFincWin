// 10-12 (ACC-06/07): deviceInfo, heartbeat throttle, list and revoke hooks.
import React from 'react';
import { AppState } from 'react-native';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';

import { useDevices, useRevokeDevice, useSignOutOthers } from '../useDevices';
import { useDeviceHeartbeat } from '../useDeviceHeartbeat';
import { deviceInfo } from '../deviceInfo';

const mockRpc = jest.fn();
const mockSignOut = jest.fn();

const fakeClient = {
  rpc: (...a: unknown[]) => mockRpc(...a),
  auth: { signOut: (...a: unknown[]) => mockSignOut(...a) },
};
const getClient = async () => fakeClient as never;
jest.mock('expo-device', () => ({ modelName: 'Pixel 9', osName: 'Android', osVersion: '16' }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.2.3' }));

function wrapperFor(qc: QueryClient) {
  return function W({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}
function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: null, error: null, status: 200 });
  mockSignOut.mockResolvedValue({ error: null });
  onlineManager.setOnline(true);
});

describe('deviceInfo', () => {
  it('builds model, os and app version', () => {
    expect(deviceInfo()).toEqual({ model: 'Pixel 9', os: 'Android 16', appVersion: '1.2.3' });
  });
});

describe('useDeviceHeartbeat', () => {
  it('touches once on mount and not again on an active event under 15 minutes', async () => {
    let listener: ((s: string) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
      listener = cb;
      return { remove: jest.fn() };
    }) as never);
    await renderHook(() => useDeviceHeartbeat('u1', getClient));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
    expect(mockRpc).toHaveBeenCalledWith('touch_my_device', { p_model: 'Pixel 9', p_os: 'Android 16', p_app_version: '1.2.3' });
    await act(async () => {
      listener?.('active');
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('touches again on active after 15 minutes', async () => {
    let listener: ((s: string) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
      listener = cb;
      return { remove: jest.fn() };
    }) as never);
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    await renderHook(() => useDeviceHeartbeat('u1', getClient));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
    now.mockReturnValue(1_000_000 + 15 * 60 * 1000);
    await act(async () => {
      listener?.('active');
    });
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
    now.mockRestore();
    spy.mockRestore();
  });

  it('does nothing offline or without a user', async () => {
    onlineManager.setOnline(false);
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
    await renderHook(() => useDeviceHeartbeat('u1', getClient));
    await renderHook(() => useDeviceHeartbeat(undefined, getClient));
    expect(mockRpc).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('useDevices and revoke', () => {
  it('lists devices, current first', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { session_id: 's2', model: 'iPhone XR', os: 'iOS 18', app_version: '1', last_active: '2026-11-22T10:00:00Z', signed_in_at: '2026-11-01T00:00:00Z', is_current: false },
        { session_id: 's1', model: 'Pixel 9', os: 'Android 16', app_version: '1', last_active: '2026-11-21T10:00:00Z', signed_in_at: '2026-11-01T00:00:00Z', is_current: true },
      ],
      error: null,
      status: 200,
    });
    const qc = newClient();
    const { result } = await renderHook(() => useDevices('u1', getClient), { wrapper: wrapperFor(qc) });
    await waitFor(() => expect(result.current.data?.length).toBe(2));
    expect(result.current.data?.[0].sessionId).toBe('s1');
  });

  it('revoke calls the rpc then invalidates the list', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null, status: 200 });
    const qc = newClient();
    const inv = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useRevokeDevice('u1', getClient), { wrapper: wrapperFor(qc) });
    await act(async () => {
      await result.current.mutateAsync('s2');
    });
    expect(mockRpc).toHaveBeenCalledWith('revoke_my_session', { p_session: 's2' });
    expect(inv).toHaveBeenCalledWith({ queryKey: ['devices', 'u1'] });
  });

  it("sign out of others uses scope 'others' then invalidates", async () => {
    const qc = newClient();
    const inv = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useSignOutOthers('u1', getClient), { wrapper: wrapperFor(qc) });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(inv).toHaveBeenCalled();
  });
});
