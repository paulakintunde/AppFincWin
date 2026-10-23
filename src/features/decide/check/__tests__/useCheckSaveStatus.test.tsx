import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { mutationKeys } from '@/data/keys';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { saveStatusOf, useAnnounceSaveStatus, useCheckSaveStatus, type SaveMutation, type SaveStatus } from '../useCheckSaveStatus';

jest.mock('@/data/sync/failedWrites', () => {
  const none: never[] = [];
  return {
    getFailedWrites: () => none,
    subscribeFailedWrites: () => () => undefined,
  };
});

const base = { rowExists: true, decided: false, pendingEdit: false, editedOffline: false, online: true, mutations: [] as SaveMutation[], parkedFailure: false };
const m = (status: SaveMutation['status'], isPaused = false, submittedAt = 1): SaveMutation => ({ status, isPaused, submittedAt });

function wrapper(qc: QueryClient) {
  return function W({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

describe('useCheckSaveStatus', () => {
  it('D-77 save status follows the R9 table', () => {
    const rows: [string, Parameters<typeof saveStatusOf>[0], SaveStatus][] = [
      ['new unedited', { ...base, rowExists: false }, null],
      ['decided', { ...base, decided: true, pendingEdit: true }, null],
      ['saving: pending edit', { ...base, pendingEdit: true }, 'saving'],
      ['saving: in flight', { ...base, mutations: [m('pending')] }, 'saving'],
      ['first edit, no row yet', { ...base, rowExists: false, pendingEdit: true }, 'saving'],
      ['offline: paused write', { ...base, mutations: [m('pending', true)] }, 'offline'],
      ['offline: edited offline', { ...base, online: false, editedOffline: true, pendingEdit: true }, 'offline'],
      ['saved', { ...base, mutations: [m('success')] }, 'saved'],
      ['saved: row only', base, 'saved'],
      ['failed: newest settled errored', { ...base, mutations: [m('success', false, 1), m('error', false, 2)] }, 'failed'],
      ['saved: an older error was followed by a success', { ...base, mutations: [m('error', false, 1), m('success', false, 2)] }, 'saved'],
      ['failed: parked', { ...base, parkedFailure: true }, 'failed'],
    ];
    for (const [name, input, want] of rows) expect([name, saveStatusOf(input)]).toEqual([name, want]);
  });

  it('D-77 the hook reads the create and save mutations for its own id only', async () => {
    const qc = new QueryClient();
    clients.push(qc);
    onlineManager.setOnline(false);
    const mk = (key: readonly string[], id: string) =>
      void qc.getMutationCache().build(qc, { mutationKey: key, mutationFn: () => new Promise(() => undefined) }).execute({ id }).catch(() => undefined);
    const hook = await renderHook(() => useCheckSaveStatus({ id: 'c1', rowExists: true, decided: false, pendingEdit: false, editedOffline: false }), { wrapper: wrapper(qc) });
    expect(hook.result.current).toBe('saved');
    await act(async () => mk(mutationKeys.saveCheckDraft, 'other'));
    expect(hook.result.current).toBe('saved');
    await act(async () => mk(mutationKeys.saveCheckDraft, 'c1'));
    await waitFor(() => expect(hook.result.current).toBe('offline'));
  });

  it('D-77 announces only offline and not saved', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const hook = await renderHook(({ s }: { s: SaveStatus }) => useAnnounceSaveStatus(s), { initialProps: { s: null as SaveStatus } });
    for (const s of ['saving', 'saved', 'saving'] as const) await hook.rerender({ s });
    expect(spy).not.toHaveBeenCalled();
    await hook.rerender({ s: 'offline' });
    expect(spy).toHaveBeenCalledTimes(1);
    await hook.rerender({ s: 'offline' });
    expect(spy).toHaveBeenCalledTimes(1);
    await hook.rerender({ s: 'failed' });
    expect(spy).toHaveBeenCalledTimes(2);
    await hook.rerender({ s: 'saved' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('D-77 useSyncStatus counts queued Decide writes', async () => {
    const qc = new QueryClient();
    clients.push(qc);
    onlineManager.setOnline(false);
    const hook = await renderHook(() => useSyncStatus(), { wrapper: wrapper(qc) });
    expect(hook.result.current.queued).toBe(0);
    await act(async () => {
      void qc.getMutationCache().build(qc, { mutationKey: mutationKeys.saveCheckDraft, mutationFn: async () => null }).execute({ id: 'c1' }).catch(() => undefined);
    });
    await waitFor(() => expect(hook.result.current.queued).toBe(1));
  });
});
