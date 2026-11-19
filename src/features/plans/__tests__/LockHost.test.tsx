import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LockHost } from '../LockHost';
import type { PlanStatus } from '../types';
import { getPlanWriteState } from '@/data/sync/planWriteGuard';

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
const mockDrop = jest.fn(async () => 0);
jest.mock('@/data/sync/lockedWrites', () => ({
  dropLockedWrites: () => mockDrop(),
  getLockedWrites: () => mockWrites,
  useLockedWrites: () => mockWrites,
  hydrateLockedWrites: () => mockHydrate(),
  replayLockedWrites: (...a: unknown[]) => mockReplay(...a),
}));
const mockToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));

// 09-23 (P3): the setup-records deps; a setup with an account answer not yet applied.
const mockApply = jest.fn(async () => 'applied' as const);
let mockSetupNeeds = false;
jest.mock('@/features/onboarding/useSetupRecordsDeps', () => ({
  useSetupRecordsDeps: () => ({ setup: { needs: mockSetupNeeds }, userId: 'u1', homeCurrency: 'GBP' }),
}));
jest.mock('@/features/onboarding/applyOnboardingRecords', () => ({
  needsRecords: (s: { needs: boolean } | null) => s?.needs === true,
  applyOnboardingRecords: (...a: unknown[]) => mockApply(...(a as [])),
}));

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
  mockApply.mockClear();
  mockSetupNeeds = false;
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

// Kept above the explainer block: its fire-and-forget storage push overlaps act() for the blocks after it.
describe('LockHost setup records (09-23, owner P3)', () => {
  it('does nothing while the plan is not writable', async () => {
    mockSetupNeeds = true;
    mockPlan = plan({ status: 'sample', writable: false });
    await mount();
    await act(async () => undefined);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('applies once when the household becomes covered, with the plan and deps', async () => {
    mockSetupNeeds = true;
    mockPlan = plan({ status: 'sample', writable: false });
    const host = await mount();
    await act(async () => undefined);
    mockPlan = plan({ status: 'trial', writable: true });
    await host.again();
    await act(async () => undefined);
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', plan: { writable: true, loading: false, householdId: 'h1' } })
    );
    await host.again();
    await act(async () => appStateListener?.('active'));
    expect(mockApply).toHaveBeenCalledTimes(1);
  });

  it('a failed lookup retries on the next foreground', async () => {
    mockSetupNeeds = true;
    mockPlan = plan({});
    mockApply.mockRejectedValueOnce(new Error('offline'));
    await mount();
    await act(async () => undefined);
    expect(mockApply).toHaveBeenCalledTimes(1);
    await act(async () => appStateListener?.('active'));
    expect(mockApply).toHaveBeenCalledTimes(2);
  });

  it('nothing to apply: never called', async () => {
    mockPlan = plan({});
    await mount();
    await act(async () => undefined);
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe('LockHost explainer', () => {
  it('opens the explainer once for a lock and not again for the same pair', async () => {
    mockPlan = plan({ status: 'locked', writable: false });
    const first = await mount();
    await act(async () => undefined);
    expect(mockPush).toHaveBeenCalledWith('/plan-ended');
    await first.unmount();
    await mount();
    await act(async () => undefined);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

// 09-25 (A2-W): the plan view reaches the central write guard, and nothing made in the look-around is kept.
describe('LockHost and the central guard', () => {
  beforeEach(() => mockDrop.mockClear());

  it('publishes the plan view to the guard', async () => {
    mockPlan = plan({ status: 'sample', writable: false, coveredUntil: null });
    await mount();
    expect(getPlanWriteState()).toEqual({ status: 'sample', writable: false, loading: false });
  });

  it('sample with kept writes drops them and never replays', async () => {
    mockPlan = plan({ status: 'sample', writable: false, coveredUntil: null });
    mockWrites = [{ id: 'w1' }];
    await mount();
    expect(mockDrop).toHaveBeenCalledTimes(1);
    expect(mockReplay).not.toHaveBeenCalled();
  });

  it('locked or loading keeps them (D-40)', async () => {
    mockWrites = [{ id: 'w1' }];
    mockPlan = plan({ status: 'locked', writable: false });
    await mount();
    mockPlan = plan({ status: 'sample', writable: false, loading: true });
    await mount();
    expect(mockDrop).not.toHaveBeenCalled();
  });
});
