// 06.1-12 (D-23): the four 'I answered this' flags go through the one setup write with one Undo carrying the previous value.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { EMPTY_DECIDE_SETTINGS, type DecideSettingsRow } from '@/db/decideSettings';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import { DECIDE_ANSWERED_COLUMNS, registerDecideSetupMutations, useSetDecideAnswered } from '../decideSetup';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));

let seq = 0;
const ok = (data: unknown) => ({ data, error: null, status: 200 });
const wrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

function setup(over: Partial<DecideSettingsRow> = {}) {
  seq += 1;
  const user = `flag-user-${seq}`;
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideSetupMutations(qc);
  qc.setQueryData(queryKeys.decideSettings(user), { ...EMPTY_DECIDE_SETTINGS, id: 's1', user_id: user, version: 1, ...over });
  return { fake, qc, user };
}
const undoInsert = (fake: FakeSupabase) => fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');

beforeEach(() => onlineManager.setOnline(true));

describe('useSetDecideAnswered', () => {
  it('maps the four flags to their columns', () => {
    expect(DECIDE_ANSWERED_COLUMNS).toEqual({
      no_debts: 'answered_no_debts_at',
      net_not_set: 'answered_net_not_set_at',
      no_rules: 'answered_no_rules_at',
      bills_right: 'answered_bills_right_at',
    });
  });

  it('setting a flag is one upsert and one undo step carrying the previous null', async () => {
    const { fake, qc, user } = setup();
    fake.respondWith(ok({ ...EMPTY_DECIDE_SETTINGS, id: 's1', user_id: user, version: 2, answered_no_rules_at: '2026-11-11T10:00:00Z' }));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSetDecideAnswered(user), { wrapper: wrapper(qc) });
    const out = result.current.set({ flag: 'no_rules', on: true });
    expect(out).not.toBeNull();
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    const upserts = fake.calls.filter((c) => c.method === 'upsert');
    expect(upserts).toHaveLength(1);
    expect(Object.keys(upserts[0]!.args[0] as object).sort()).toEqual(['answered_no_rules_at', 'user_id']);
    const payload = undoInsert(fake)?.args[0] as { label_key: string; ops: { patch: unknown }[] };
    expect(payload.label_key).toBe('answerSaved');
    expect(payload.ops[0]!.patch).toEqual({ answered_no_rules_at: null });
  });

  it('a flag already set (on) or already clear (off) writes nothing', async () => {
    const { fake, qc, user } = setup({ answered_bills_right_at: '2026-11-01T00:00:00Z' });
    const { result } = await renderHook(() => useSetDecideAnswered(user), { wrapper: wrapper(qc) });
    expect(result.current.set({ flag: 'bills_right', on: true })).toBeNull();
    expect(result.current.set({ flag: 'no_debts', on: false })).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it('with no settings row cached, clearing writes nothing and setting writes', async () => {
    seq += 1;
    const user = `flag-user-${seq}`;
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    registerDecideSetupMutations(qc);
    fake.respondWith(ok({ ...EMPTY_DECIDE_SETTINGS, id: 's1', user_id: user, version: 1 }));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSetDecideAnswered(user), { wrapper: wrapper(qc) });
    expect(result.current.set({ flag: 'no_debts', on: false })).toBeNull();
    expect(result.current.set({ flag: 'no_debts', on: true })).not.toBeNull();
    await waitFor(() => expect(qc.isMutating()).toBe(0));
  });

  it('clearing with noUndo writes the upsert and no undo step', async () => {
    const { fake, qc, user } = setup({ answered_net_not_set_at: '2026-11-01T00:00:00Z' });
    fake.respondWith(ok({ ...EMPTY_DECIDE_SETTINGS, id: 's1', user_id: user, version: 2 }));
    const { result } = await renderHook(() => useSetDecideAnswered(user), { wrapper: wrapper(qc) });
    expect(result.current.set({ flag: 'net_not_set', on: false, noUndo: true })).not.toBeNull();
    await waitFor(() => expect(qc.isMutating()).toBe(0));
    expect(fake.calls.filter((c) => c.method === 'upsert')).toHaveLength(1);
    expect(undoInsert(fake)).toBeUndefined();
  });
});
