// 02.2-23 Task 2 (ACT-16, D-11, D-23): unconditional, optimistic record prefs writes.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import type { RecordPrefsRow } from '@/db/recordPrefs';
import { registerRecordPrefsMutations, useUpdateRecordPrefs } from '../recordPrefs';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerRecordPrefsMutations(qc);
  return qc;
}
function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => recordFailedWrite.mockClear());

describe('useUpdateRecordPrefs', () => {
  it('setWeekStart writes week_start unconditionally and updates the cache at once', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { week_start: 0, sample_prompt_answered_at: null }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useUpdateRecordPrefs('u1'), { wrapper: wrapper(qc) });

    result.current.setWeekStart(0);

    await waitFor(() => expect(qc.getQueryData<RecordPrefsRow>(queryKeys.recordPrefs('u1'))?.week_start).toBe(0));
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'update')).toBe(true));
    const update = fake.calls.find((c) => c.method === 'update');
    expect(update?.table).toBe('profiles');
    expect(update?.args[0]).toEqual({ week_start: 0 });
    expect(fake.calls.some((c) => c.method === 'eq' && c.args[0] === 'version')).toBe(false);
  });

  it('markSamplePromptAnswered stamps the current ISO time', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { week_start: null, sample_prompt_answered_at: 'x' }, error: null, status: 200 });
    const qc = newClient();
    const { result } = await renderHook(() => useUpdateRecordPrefs('u1'), { wrapper: wrapper(qc) });

    result.current.markSamplePromptAnswered();

    await waitFor(() => expect(fake.calls.some((c) => c.method === 'update')).toBe(true));
    const patch = fake.calls.find((c) => c.method === 'update')?.args[0] as { sample_prompt_answered_at: string };
    expect(new Date(patch.sample_prompt_answered_at).toISOString()).toBe(patch.sample_prompt_answered_at);
  });

  it('rolls the cache back and records a failed write when rejected', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });
    const qc = newClient();
    qc.setQueryData<RecordPrefsRow>(queryKeys.recordPrefs('u1'), { week_start: 1, sample_prompt_answered_at: null });
    const { result } = await renderHook(() => useUpdateRecordPrefs('u1'), { wrapper: wrapper(qc) });

    result.current.setWeekStart(0);

    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(qc.getQueryData<RecordPrefsRow>(queryKeys.recordPrefs('u1'))?.week_start).toBe(1);
    expect(recordFailedWrite).toHaveBeenCalledWith(expect.objectContaining({ entity: 'profiles', kind: 'rejected' }));
  });
});
