import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LockHost } from '../LockHost';
import type { PlanStatus } from '../types';

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

interface MockPlan {
  status: PlanStatus;
  writable: boolean;
  loading: boolean;
  householdId: string | null;
  coveredUntil: string | null;
}
let mockPlan: MockPlan;
jest.mock('../usePlanState', () => ({ usePlanState: () => mockPlan }));

let mockWrites: unknown[] = [];
const mockReplay = jest.fn();
const mockHydrate = jest.fn(async () => undefined);
jest.mock('@/data/sync/lockedWrites', () => ({
  getLockedWrites: () => mockWrites,
  useLockedWrites: () => mockWrites,
  hydrateLockedWrites: () => mockHydrate(),
  replayLockedWrites: (...a: unknown[]) => mockReplay(...a),
}));
const mockToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));

let appStateListener: ((s: string) => void) | null = null;

function plan(over: Partial<MockPlan>): MockPlan {
  return { status: 'active', writable: true, loading: false, householdId: 'h1', coveredUntil: '2026-12-01', ...over };
}

async function mount() {
  const qc = new QueryClient();
  const ui = () => (
    <QueryClientProvider client={qc}>
      <LockHost />
    </QueryClientProvider>
  );
  const utils = await render(ui());
  return { ...utils, again: async () => utils.rerender(ui()) };
}

beforeEach(async () => {
  mockPush.mockClear();
  mockReplay.mockReset().mockResolvedValue({ synced: 1, stillLocked: 0 });
  mockToast.mockClear();
  mockWrites = [];
  appStateListener = null;
  await AsyncStorage.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
    appStateListener = cb;
    return { remove: jest.fn() };
  }) as never);
});

describe('LockHost replay', () => {
  it('cold start: already writable with a kept write replays exactly once and toasts', async () => {
    mockWrites = [{ id: 'w1' }];
    mockPlan = plan({});
    const { again } = await mount();
    await act(async () => undefined);
    await again();
    await act(async () => undefined);
    expect(mockReplay).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({ kind: 'info', text: { key: 'lock.savedOffline.synced' } });
  });

  it('cold start with an empty store does not replay', async () => {
    mockPlan = plan({});
    await mount();
    await act(async () => undefined);
    expect(mockReplay).not.toHaveBeenCalled();
  });

  it('cold start while not writable, or still loading, does not replay', async () => {
    mockWrites = [{ id: 'w1' }];
    mockPlan = plan({ status: 'locked', writable: false });
    const first = await mount();
    mockPlan = plan({ loading: true, writable: false });
    await first.again();
    await act(async () => undefined);
    expect(mockReplay).not.toHaveBeenCalled();
  });

  it('the lock lifting while the app is open replays once', async () => {
    mockWrites = [{ id: 'w1' }];
    mockPlan = plan({ status: 'locked', writable: false });
    const { again } = await mount();
    mockPlan = plan({});
    await again();
    await act(async () => undefined);
    expect(mockReplay).toHaveBeenCalledTimes(1);
  });

  it('a foreground return replays again, never two at once', async () => {
    mockWrites = [{ id: 'w1' }];
    mockPlan = plan({});
    let release: (v: { synced: number; stillLocked: number }) => void = () => undefined;
    mockReplay.mockImplementationOnce(() => new Promise((r) => (release = r)));
    await mount();
    await act(async () => undefined);
    expect(mockReplay).toHaveBeenCalledTimes(1);
    // still in flight: a foreground event is ignored
    await act(async () => appStateListener?.('active'));
    expect(mockReplay).toHaveBeenCalledTimes(1);
    await act(async () => release({ synced: 0, stillLocked: 1 }));
    // no loop after stillLocked: nothing more until the next foreground
    expect(mockReplay).toHaveBeenCalledTimes(1);
    await act(async () => appStateListener?.('active'));
    expect(mockReplay).toHaveBeenCalledTimes(2);
  });
});

describe('LockHost explainer', () => {
  it('opens the explainer once for a lock and not again for the same pair', async () => {
    mockPlan = plan({ status: 'locked', writable: false });
    const first = await mount();
    await act(async () => undefined);
    expect(mockPush).toHaveBeenCalledWith('/plan-ended');
    first.unmount();
    await mount();
    await act(async () => undefined);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
