// 10-03: archive / restore months and alert settings and prefs go through the paused-mutation write queue:
// optimistic, rolled back on a server refusal, and replayed after a restart.
import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { DEFAULT_ALERT_PREFS } from '@/db/alerts';
import type { AlertPrefs, AlertSetting } from '@/db/alerts';
import { queryKeys } from '@/data/keys';
import { registerMutationDefaults } from '@/data/mutations';
import { useArchiveMonth, useRestoreAllMonths, useRestoreMonth } from '@/data/mutations/archivedMonths';
import { useSaveAlertPrefs, useSaveAlertSetting } from '@/data/mutations/alertSettings';
import { clearVersionChains } from '@/data/sync/versionChain';
import { persistOptions, resumeRestoredMutations } from '@/data/cache/persister';

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'uuid-0') }));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceTimeZone: jest.fn(() => 'UTC') }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  return qc;
}

function memoryStorage(backing: Map<string, string> = new Map()) {
  return {
    getItem: async (key: string) => backing.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: async (key: string) => {
      backing.delete(key);
    },
  };
}

beforeEach(() => {
  onlineManager.setOnline(true);
  clearVersionChains();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

const U = 'user-1';
const monthsKey = queryKeys.archivedMonths(U);

describe('archived months', () => {
  it('archive adds the month optimistically (newest first) and restore removes it', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);
    const qc = newClient();
    qc.setQueryData<string[]>(monthsKey, ['2026-01']);
    const archive = await renderHook(() => useArchiveMonth(), { wrapper: wrapper(qc) });
    const restore = await renderHook(() => useRestoreMonth(), { wrapper: wrapper(qc) });

    archive.result.current.archiveMonth({ userId: U, month: '2026-03' });
    await waitFor(() => expect(qc.getQueryData(monthsKey)).toEqual(['2026-03', '2026-01']));
    expect(fake.calls.some((c) => c.method === 'upsert')).toBe(false);

    restore.result.current.restoreMonth({ userId: U, month: '2026-01' });
    await waitFor(() => expect(qc.getQueryData(monthsKey)).toEqual(['2026-03']));
  });

  it('restore all empties the list', async () => {
    mockActiveClient = createFakeSupabase();
    onlineManager.setOnline(false);
    const qc = newClient();
    qc.setQueryData<string[]>(monthsKey, ['2026-03', '2026-01']);
    const hook = await renderHook(() => useRestoreAllMonths(), { wrapper: wrapper(qc) });
    hook.result.current.restoreAllMonths({ userId: U });
    await waitFor(() => expect(qc.getQueryData(monthsKey)).toEqual([]));
  });

  it('rolls back when the server rejects the write', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });
    const qc = newClient();
    qc.setQueryData<string[]>(monthsKey, ['2026-01']);
    const hook = await renderHook(() => useArchiveMonth(), { wrapper: wrapper(qc) });
    hook.result.current.archiveMonth({ userId: U, month: '2026-03' });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'upsert')).toBe(true));
    await waitFor(() => expect(qc.getQueryData(monthsKey)).toEqual(['2026-01']));
  });

  it('an archive started offline survives a restart and replays once online', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);
    const qc = newClient();
    qc.setQueryData<string[]>(monthsKey, []);
    const hook = await renderHook(() => useArchiveMonth(), { wrapper: wrapper(qc) });
    hook.result.current.archiveMonth({ userId: U, month: '2026-03' });
    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.isPaused).toBe(true));

    const backing = new Map<string, string>();
    const persister = createAsyncStoragePersister({ storage: memoryStorage(backing), key: 'test-cache', throttleTime: 0 });
    await persistQueryClientSave({ queryClient: qc, persister, buster: 'test', dehydrateOptions: persistOptions.dehydrateOptions });

    const restarted = newClient();
    await persistQueryClientRestore({ queryClient: restarted, persister, buster: 'test' });
    expect(restarted.getMutationCache().getAll()).toHaveLength(1);

    const replay = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = replay;
    replay.respondWith({ data: null, error: null, status: 201 });
    onlineManager.setOnline(true);
    await resumeRestoredMutations(restarted);
    const upsert = replay.calls.find((c) => c.method === 'upsert');
    expect(upsert?.table).toBe('archived_months');
    expect(upsert?.args[0]).toMatchObject({ user_id: U, month: '2026-03' });
  });
});

describe('alert settings and prefs', () => {
  it('replaces just the one kind optimistically and sends baseVersion + 1', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);
    const qc = newClient();
    const list: AlertSetting[] = (['bills_due', 'over_cap', 'goal_reached', 'large_txn', 'low_balance'] as const).map((kind) => ({
      kind, enabled: false, thresholdMinor: null, thresholdCurrency: null, leadDays: null, version: 0,
    }));
    qc.setQueryData(queryKeys.alertSettings(U), list);
    const hook = await renderHook(() => useSaveAlertSetting(), { wrapper: wrapper(qc) });
    hook.result.current.saveAlertSetting({
      userId: U,
      setting: { kind: 'large_txn', enabled: true, thresholdMinor: 100000, thresholdCurrency: 'USD', leadDays: null },
      baseVersion: 2,
    });
    await waitFor(() => {
      const got = qc.getQueryData<AlertSetting[]>(queryKeys.alertSettings(U));
      expect(got?.find((s) => s.kind === 'large_txn')).toMatchObject({ enabled: true, thresholdMinor: 100000, version: 3 });
    });
    const got = qc.getQueryData<AlertSetting[]>(queryKeys.alertSettings(U));
    expect(got?.find((s) => s.kind === 'over_cap')?.enabled).toBe(false);

    const replay = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = replay;
    replay.respondWith({
      data: { kind: 'large_txn', enabled: true, threshold_minor: 100000, threshold_currency: 'USD', lead_days: null, version: 3 },
      error: null,
      status: 200,
    });
    onlineManager.setOnline(true);
    await waitFor(() => expect(replay.calls.some((c) => c.method === 'upsert')).toBe(true));
    const row = replay.calls.find((c) => c.method === 'upsert')?.args[0] as { version: number; threshold_minor: number };
    expect(row.version).toBe(3);
    expect(row.threshold_minor).toBe(100000);
  });

  it('merges a prefs patch into the cached prefs', async () => {
    mockActiveClient = createFakeSupabase();
    onlineManager.setOnline(false);
    const qc = newClient();
    qc.setQueryData<AlertPrefs>(queryKeys.alertPrefs(U), { ...DEFAULT_ALERT_PREFS, version: 1 });
    const hook = await renderHook(() => useSaveAlertPrefs(), { wrapper: wrapper(qc) });
    hook.result.current.saveAlertPrefs({ userId: U, patch: { mode: 'digest', quietEnd: '08:00' }, baseVersion: 1 });
    await waitFor(() => {
      expect(qc.getQueryData<AlertPrefs>(queryKeys.alertPrefs(U))).toMatchObject({
        mode: 'digest',
        quietEnd: '08:00',
        quietStart: '22:00',
        partnerAlerts: true,
        version: 2,
      });
    });
  });
});
