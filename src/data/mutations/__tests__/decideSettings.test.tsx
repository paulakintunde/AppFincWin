// 05-19: the lines-you-will-not-cross limits and rough figures save once per user (D-14, D-03).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { EMPTY_DECIDE_SETTINGS, type DecideSettingsRow } from '@/db/decideSettings';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { registerDecideSettingsMutations, useUpdateDecideSettings } from '../decideSettings';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));

jest.mock('@/data/sync/failedWrites', () => ({
  recordFailedWrite: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordFailedWrite } = require('@/data/sync/failedWrites') as { recordFailedWrite: jest.Mock };

const KEY = queryKeys.decideSettings('user-1');

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideSettingsMutations(qc);
  return { fake, qc };
}

const row = (overrides: Partial<DecideSettingsRow> = {}): DecideSettingsRow => ({
  ...EMPTY_DECIDE_SETTINGS,
  user_id: 'user-1',
  version: 1,
  ...overrides,
});

beforeEach(() => {
  recordFailedWrite.mockClear();
});

describe('useUpdateDecideSettings', () => {
  it('upserts the patch, merges it into the cache over the empty settings and stores the server row', async () => {
    const { fake, qc } = setup();
    fake.respondWith({ data: row({ rough_income: 500000, rough_spending: 350000, currency: 'GBP' }), error: null, status: 200 });
    const { result } = await renderHook(() => useUpdateDecideSettings('user-1'), { wrapper: wrapper(qc) });

    result.current.update({ rough_income: 500000, rough_spending: 350000, currency: 'GBP' });
    await waitFor(() => expect(qc.getQueryData<DecideSettingsRow>(KEY)?.version).toBe(1));

    expect(fake.calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({
      user_id: 'user-1',
      rough_income: 500000,
      rough_spending: 350000,
      currency: 'GBP',
    });
    expect(qc.getQueryData<DecideSettingsRow>(KEY)).toMatchObject({ rough_income: 500000, reserve: null });
  });

  it('a blank line saves null', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ reserve: 200000 }));
    fake.respondWith({ data: row({ reserve: null, version: 2 }), error: null, status: 200 });
    const { result } = await renderHook(() => useUpdateDecideSettings('user-1'), { wrapper: wrapper(qc) });

    result.current.update({ reserve: null });
    await waitFor(() => expect(qc.getQueryData<DecideSettingsRow>(KEY)?.version).toBe(2));
    expect(fake.calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({ user_id: 'user-1', reserve: null });
    expect(qc.getQueryData<DecideSettingsRow>(KEY)?.reserve).toBeNull();
  });

  it('rolls back on a rejection and records field names only', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ reserve: 200000 }));
    fake.respondWith({ data: null, error: { message: 'no', code: '23514' }, status: 400 });
    const { result } = await renderHook(() => useUpdateDecideSettings('user-1'), { wrapper: wrapper(qc) });

    result.current.update({ reserve: 999 });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(qc.getQueryData<DecideSettingsRow>(KEY)?.reserve).toBe(200000);
    const failure = recordFailedWrite.mock.calls[0]![0];
    expect(failure).toMatchObject({ entity: 'decide_settings', attempted: { fields: ['reserve'] } });
    expect(JSON.stringify(failure)).not.toContain('999');
  });
});
