import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { queryKeys } from '../../keys';
import { HOUSEHOLD_CHANNEL_TABLES, closeAllHouseholdChannels, openChannelCount } from '../channel';
import { useHouseholdRealtime } from '../useHouseholdRealtime';
import { getRealtimeStatus } from '../realtimeStatus';

const mockOn = jest.fn();
let mockStatusCb: ((s: string) => void) | null = null;
const mockChannel: { on: jest.Mock; subscribe: jest.Mock } = {
  on: mockOn,
  subscribe: jest.fn((cb: (s: string) => void) => {
    mockStatusCb = cb;
    return mockChannel;
  }),
};
const mockRemoveChannel = jest.fn(() => Promise.resolve('ok'));
const mockChannelFn = jest.fn(() => mockChannel);
const mockUnsub = jest.fn();
const mockAuthCb: { current: ((e: string, s: unknown) => void) | null } = { current: null };
const mockSetAuth = jest.fn();


jest.mock('@/services/supabase', () => ({
  supabase: {
    channel: (...a: unknown[]) => (mockChannelFn as (...x: unknown[]) => unknown)(...a),
    removeChannel: (...a: unknown[]) => (mockRemoveChannel as (...x: unknown[]) => unknown)(...a),
    realtime: { setAuth: (...a: unknown[]) => mockSetAuth(...a) },
    auth: {
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        mockAuthCb.current = cb;
        return { data: { subscription: { unsubscribe: mockUnsub } } };
      },
    },
  },
}));
jest.mock('@/services/storage/wipe', () => ({
  registerWipeHandler: (h: { id: string; wipe(): Promise<void> }) => {
    (globalThis as { __wipe?: unknown }).__wipe = h;
    return () => undefined;
  },
}));
const mockMembers = { data: [{ user_id: 'a' }, { user_id: 'b' }] as unknown[] | undefined };
jest.mock('../../queries/household', () => ({
  useHouseholdMembers: () => mockMembers,
  resetHouseholdScope: jest.fn(),
}));


function wrapperFor(qc: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOn.mockImplementation(() => mockChannel);
  mockMembers.data = [{ user_id: 'a' }, { user_id: 'b' }];
  mockStatusCb = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
});

describe('household channel', () => {
  it('listens to every shared table with a household filter', async () => {
    const qc = new QueryClient();
    await renderHook(() => useHouseholdRealtime('h1', 'a'), { wrapper: wrapperFor(qc) });
    expect(mockChannelFn).toHaveBeenCalledWith('household:h1');
    const calls = mockOn.mock.calls.map((c) => c[1] as { table: string; filter: string; event: string });
    expect(calls.map((c) => c.table)).toEqual([...HOUSEHOLD_CHANNEL_TABLES]);
    for (const c of calls) {
      expect(c.filter).toBe('household_id=eq.h1');
      expect(c.event).toBe('*');
    }
    expect(calls.map((c) => c.table)).toEqual(expect.arrayContaining(['transactions', 'settlements', 'household_events']));
  });

  it('removes the channel on cleanup', async () => {
    const qc = new QueryClient();
    const { unmount } = await renderHook(() => useHouseholdRealtime('h1', 'a'), { wrapper: wrapperFor(qc) });
    expect(openChannelCount()).toBe(1);
    await unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    expect(openChannelCount()).toBe(0);
    expect(mockUnsub).toHaveBeenCalled();
  });

  it('re-subscribes on a household change and removes the old channel', async () => {
    const qc = new QueryClient();
    const { rerender } = await renderHook(({ id }: { id: string }) => useHouseholdRealtime(id, 'a'), {
      wrapper: wrapperFor(qc),
      initialProps: { id: 'h1' },
    });
    await rerender({ id: 'h2' });
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    expect(mockChannelFn).toHaveBeenLastCalledWith('household:h2');
  });

  it('removes channels on the wipe handler (sign-out, account deletion)', async () => {
    const qc = new QueryClient();
    await renderHook(() => useHouseholdRealtime('h1', 'a'), { wrapper: wrapperFor(qc) });
    expect(getWipe()?.id).toBe('realtime-channels');
    await getWipe()!.wipe();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    expect(openChannelCount()).toBe(0);
    closeAllHouseholdChannels();
  });

  it('refetches shared reads on every SUBSCRIBED, goes paused on an error, and live again on re-subscribe', async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await renderHook(() => useHouseholdRealtime('h1', 'a'), { wrapper: wrapperFor(qc) });
    await act(async () => mockStatusCb!('SUBSCRIBED'));
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.settlements('h1') });
    expect(getRealtimeStatus()).toBe('live');
    spy.mockClear();
    await act(async () => mockStatusCb!('CHANNEL_ERROR'));
    expect(getRealtimeStatus()).toBe('paused');
    expect(spy).not.toHaveBeenCalled();
    await act(async () => mockStatusCb!('SUBSCRIBED'));
    expect(getRealtimeStatus()).toBe('live');
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') });
  });

  it('refetches when the app returns to the foreground and when the device comes back online', async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    let appCb: ((s: string) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, cb: (s: string) => void) => {
      appCb = cb;
      return { remove: jest.fn() };
    }) as never);
    await renderHook(() => useHouseholdRealtime('h1', 'a'), { wrapper: wrapperFor(qc) });
    await act(async () => appCb!('active'));
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') });
    spy.mockClear();
    await act(async () => onlineManager.setOnline(false));
    await act(async () => onlineManager.setOnline(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.transactionsRoot('h1') });
  });

  it('opens no channel for a household of one', async () => {
    mockMembers.data = [{ user_id: 'a' }];
    const qc = new QueryClient();
    await renderHook(() => useHouseholdRealtime('h1', 'a'), { wrapper: wrapperFor(qc) });
    expect(mockChannelFn).not.toHaveBeenCalled();
  });

  it('hands a refreshed token to the socket', async () => {
    const qc = new QueryClient();
    await renderHook(() => useHouseholdRealtime('h1', 'a'), { wrapper: wrapperFor(qc) });
    mockAuthCb.current!('TOKEN_REFRESHED', { access_token: 'tok2' });
    expect(mockSetAuth).toHaveBeenCalledWith('tok2');
  });
});

function getWipe(): { id: string; wipe(): Promise<void> } | undefined {
  return (globalThis as { __wipe?: { id: string; wipe(): Promise<void> } }).__wipe;
}
