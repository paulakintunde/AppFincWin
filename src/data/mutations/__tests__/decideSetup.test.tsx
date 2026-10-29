// 05.2-13: setup-step saves, Reset, refine stamps and the unexplained answer write decide_settings through the
// serial queue and record one real undo step (entity decide_settings).
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import { EMPTY_DECIDE_SETTINGS, type DecideSettingsRow } from '@/db/decideSettings';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { mutationKeys, queryKeys } from '@/data/keys';
import { registerMutationDefaults } from '../index';
import {
  RESET_COLUMNS,
  changedSettingsKeys,
  registerDecideSetupMutations,
  toPatchValue,
  useResetDecideSetup,
  useSaveSetupStep,
  useSaveUnexplainedAnswer,
  useStampRefine,
} from '../decideSetup';
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

let seq = 0;
let USER = 'user-0';
let KEY = queryKeys.decideSettings(USER);

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup(): { fake: FakeSupabase & DbClient; qc: QueryClient } {
  seq += 1;
  USER = `user-${seq}`;
  KEY = queryKeys.decideSettings(USER);
  const fake = createFakeSupabase() as FakeSupabase & DbClient;
  mockActiveClient = fake;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideSetupMutations(qc);
  return { fake, qc };
}

const row = (overrides: Partial<DecideSettingsRow> = {}): DecideSettingsRow => ({
  ...EMPTY_DECIDE_SETTINGS,
  id: 'set-1',
  user_id: USER,
  version: 1,
  ...overrides,
});

const ok = (data: unknown) => ({ data, error: null, status: 200 });
const undoInsert = (fake: FakeSupabase) => fake.calls.find((c) => c.table === 'undo_log' && c.method === 'insert');

beforeEach(() => {
  onlineManager.setOnline(true);
  recordFailedWrite.mockClear();
});

describe('registry', () => {
  it('registerMutationDefaults registers the setup mutation function', () => {
    const qc = new QueryClient();
    registerMutationDefaults(qc);
    expect(qc.getMutationDefaults(mutationKeys.updateDecideSetup).mutationFn).toBeDefined();
  });
});

describe('helpers', () => {
  it('toPatchValue turns arrays into Postgres literals and jsonb into JSON text', () => {
    expect(toPatchValue('income_types', ['salary_or_wages', 'freelance'])).toBe('{salary_or_wages,freelance}');
    expect(toPatchValue('income_types', ['a b', ''])).toBe('{"a b",""}');
    expect(toPatchValue('month_marks', { '2026-08': 'half' })).toBe('{"2026-08":"half"}');
    expect(toPatchValue('reserve', 5)).toBe(5);
    expect(toPatchValue('reserve', undefined)).toBeNull();
    expect(toPatchValue('income_types', null)).toBeNull();
  });

  it('changedSettingsKeys ignores equal values, undefined and a missing row reading as null', () => {
    expect(changedSettingsKeys({ reserve: null, detail: 'short' }, null)).toEqual(['detail']);
    expect(changedSettingsKeys({ income_types: ['a'], reserve: undefined }, row({ income_types: ['a'] }))).toEqual([]);
    expect(changedSettingsKeys({ income_types: ['a', 'b'] }, row({ income_types: ['a'] }))).toEqual(['income_types']);
    expect(changedSettingsKeys({ month_marks: { x: 'out' } }, row())).toEqual(['month_marks']);
    expect(changedSettingsKeys({ reserve: 3 }, row({ reserve: 4 }))).toEqual(['reserve']);
  });

  it('RESET_COLUMNS are the 23 setup answers and exclude use, refine and rough figures', () => {
    expect(RESET_COLUMNS).toHaveLength(23);
    for (const c of ['refine_last_at', 'refine_snooze_until', 'rough_income', 'rough_saving', 'currency']) {
      expect(RESET_COLUMNS).not.toContain(c);
    }
  });
});

describe('useSaveSetupStep', () => {
  it('upserts the changed step then records one decide_settings undo step with the previous values', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ detail: 'short', income_types: ['salary_or_wages'] }));
    fake.respondWith(ok(row({ detail: 'full', income_types: ['salary_or_wages', 'freelance'], version: 2 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });

    const out = result.current.save({ patch: { detail: 'full', income_types: ['salary_or_wages', 'freelance'] }, stepTitle: 'Income' });
    expect(out).not.toBeNull();
    await waitFor(() => expect(qc.getQueryData<DecideSettingsRow>(KEY)?.detail).toBe('full')); // optimistic
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());

    expect(fake.calls.filter((c) => c.method === 'upsert')).toHaveLength(1);
    expect(fake.calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({
      user_id: USER,
      detail: 'full',
      income_types: ['salary_or_wages', 'freelance'],
    });
    const payload = undoInsert(fake)?.args[0] as { id: string; label_key: string; label_params: unknown; ops: unknown[] };
    expect(payload.id).toBe(out?.stepId);
    expect(payload.label_key).toBe('setupStepSaved');
    expect(payload.label_params).toEqual({ name: 'Income' });
    expect(payload.ops).toEqual([
      {
        entity: 'decide_settings',
        id: 'set-1',
        expectedVersion: 2,
        patch: { detail: 'short', income_types: '{salary_or_wages}' },
      },
    ]);
  });

  it('captures nulls when no row existed, and an empty title sends no name', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(row({ detail: 'full', version: 1 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { detail: 'full' } });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    const payload = undoInsert(fake)?.args[0] as { label_params: unknown; ops: { patch: unknown }[] };
    expect(payload.ops[0]?.patch).toEqual({ detail: null });
    expect(payload.label_params).toEqual({});
  });

  it('writes nothing and returns null when the patch equals the cached row', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ detail: 'full', month_marks: { '2026-08': 'half' } }));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    expect(result.current.save({ patch: { detail: 'full', month_marks: { '2026-08': 'half' } } })).toBeNull();
    expect(fake.calls).toHaveLength(0);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });

  it('serialises month_marks in the undo patch', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ month_marks: { '2026-08': 'half' } }));
    fake.respondWith(ok(row({ month_marks: null, version: 2 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { month_marks: null } });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    const payload = undoInsert(fake)?.args[0] as { ops: { patch: unknown }[] };
    expect(payload.ops[0]?.patch).toEqual({ month_marks: '{"2026-08":"half"}' });
  });

  it('works offline: the cache shows the answer, then one upsert replays on reconnect', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ detail: 'short' }));
    onlineManager.setOnline(false);
    fake.respondWith(ok(row({ detail: 'full', version: 2 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { detail: 'full' } });
    await waitFor(() => expect(qc.getQueryData<DecideSettingsRow>(KEY)?.detail).toBe('full'));
    expect(fake.calls.filter((c) => c.method === 'upsert')).toHaveLength(0);

    onlineManager.setOnline(true);
    await qc.resumePausedMutations();
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    expect(fake.calls.filter((c) => c.method === 'upsert')).toHaveLength(1);
  });

  it('rolls back on a rejection and records ids and field names only, never an amount', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ steady_amount: 111111, currency: 'GBP' }));
    fake.respondWith({ data: null, error: { message: 'no', code: '23514' }, status: 400 });
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { steady_amount: 987654 } });
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalledTimes(1));
    expect(qc.getQueryData<DecideSettingsRow>(KEY)?.steady_amount).toBe(111111);
    const arg = recordFailedWrite.mock.calls[0][0] as { entity: string; entityId: string };
    expect(arg.entity).toBe('decide_settings');
    expect(arg.entityId).toBe(USER);
    const json = JSON.stringify(arg);
    expect(json).not.toContain('987654');
    expect(json).not.toContain('111111');
    expect(json).toContain('steady_amount');
  });

  it('stamps the settings currency when a new money column is written', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ currency: 'GBP' }));
    fake.respondWith(ok(row({ currency: 'GBP', unspent_anchor: 500, version: 2 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { unspent_anchor: 500 } });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    // currency already GBP: no change, so only the figure is written.
    expect(fake.calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({ user_id: USER, currency: 'GBP', unspent_anchor: 500 });
  });

  it('a money figure typed in another currency clears the other money columns in the same step', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ currency: 'GBP', reserve: 9000, reserve_goal: 1000 }));
    fake.respondWith(ok(row({ currency: 'EUR', reserve_goal: 700, version: 2 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveSetupStep(USER), { wrapper: wrapper(qc) });
    result.current.save({ patch: { reserve_goal: 700, currency: 'EUR' } });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    const sent = fake.calls.find((c) => c.method === 'upsert')?.args[0] as Record<string, unknown>;
    expect(sent).toMatchObject({ currency: 'EUR', reserve_goal: 700, reserve: null, steady_amount: null });
    const payload = undoInsert(fake)?.args[0] as { ops: { patch: Record<string, unknown> }[] };
    expect(payload.ops[0]?.patch).toMatchObject({ currency: 'GBP', reserve: 9000, reserve_goal: 1000 });
  });
});

describe('useResetDecideSetup', () => {
  it('clears only the setup answers in one write with one undo step', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(
      KEY,
      row({
        income_types: ['freelance'],
        detail: 'full',
        reserve: 5000,
        rough_income: 400000,
        refine_last_at: '2026-10-01T00:00:00Z',
        refine_snooze_until: '2026-11-01T00:00:00Z',
      }),
    );
    fake.respondWith(ok(row({ version: 2 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useResetDecideSetup(USER), { wrapper: wrapper(qc) });
    const out = result.current.reset();
    expect(out).not.toBeNull();
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());

    const sent = fake.calls.find((c) => c.method === 'upsert')?.args[0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(['user_id', ...RESET_COLUMNS].sort());
    for (const c of RESET_COLUMNS) expect(sent[c]).toBeNull();
    expect(sent).not.toHaveProperty('rough_income');
    expect(sent).not.toHaveProperty('refine_last_at');

    // Only the tables for settings and the undo log were touched.
    const tables = new Set(fake.calls.map((c) => c.table).filter(Boolean));
    expect([...tables].sort()).toEqual(['decide_settings', 'undo_log']);

    const payload = undoInsert(fake)?.args[0] as { label_key: string; ops: { entity: string; patch: unknown }[] };
    expect(payload.label_key).toBe('setupReset');
    expect(payload.ops).toHaveLength(1);
    expect(payload.ops[0]?.entity).toBe('decide_settings');
    expect(payload.ops[0]?.patch).toEqual({ income_types: '{freelance}', detail: 'full', reserve: 5000 });
  });

  it('writes nothing when every setup answer is already empty', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ rough_income: 1 }));
    const { result } = await renderHook(() => useResetDecideSetup(USER), { wrapper: wrapper(qc) });
    expect(result.current.reset()).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });
});

describe('useStampRefine', () => {
  it('markShown writes refine_last_at with no undo step', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row());
    fake.respondWith(ok(row({ refine_last_at: '2026-10-28T00:00:00Z', version: 2 })));
    const { result } = await renderHook(() => useStampRefine(USER), { wrapper: wrapper(qc) });
    result.current.markShown('2026-10-28T00:00:00Z');
    await waitFor(() => expect(qc.getQueryData<DecideSettingsRow>(KEY)?.version).toBe(2));
    expect(fake.calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({ user_id: USER, refine_last_at: '2026-10-28T00:00:00Z' });
    expect(undoInsert(fake)).toBeUndefined();
  });

  it('snooze writes refine_snooze_until with a refineSnoozed undo step', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ refine_snooze_until: '2026-10-01T00:00:00Z' }));
    fake.respondWith(ok(row({ refine_snooze_until: '2026-11-04T00:00:00Z', version: 2 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useStampRefine(USER), { wrapper: wrapper(qc) });
    const out = result.current.snooze('2026-11-04T00:00:00Z');
    expect(out).not.toBeNull();
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    const payload = undoInsert(fake)?.args[0] as { label_key: string; ops: { patch: unknown }[] };
    expect(payload.label_key).toBe('refineSnoozed');
    expect(payload.ops[0]?.patch).toEqual({ refine_snooze_until: '2026-10-01T00:00:00Z' });
  });
});

describe('useSaveUnexplainedAnswer', () => {
  it('writes amount, use and time with an answerSaved undo step', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ currency: 'GBP' }));
    fake.respondWith(ok(row({ unexplained_amount: 4200, unexplained_use: 'spare', version: 2 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveUnexplainedAnswer(USER), { wrapper: wrapper(qc) });
    expect(result.current.save({ amount: 4200, use: 'spare', at: '2026-10-28T00:00:00Z' })).not.toBeNull();
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    expect(fake.calls.find((c) => c.method === 'upsert')?.args[0]).toEqual({
      user_id: USER,
      unexplained_amount: 4200,
      unexplained_use: 'spare',
      unexplained_at: '2026-10-28T00:00:00Z',
      currency: 'GBP',
    });
    const payload = undoInsert(fake)?.args[0] as { label_key: string };
    expect(payload.label_key).toBe('answerSaved');
  });

  it('returns null for an unchanged answer (D-59)', async () => {
    const { fake, qc } = setup();
    qc.setQueryData(KEY, row({ unexplained_amount: 4200, unexplained_use: 'spare' }));
    const { result } = await renderHook(() => useSaveUnexplainedAnswer(USER), { wrapper: wrapper(qc) });
    expect(result.current.save({ amount: 4200, use: 'spare', at: '2026-11-01T00:00:00Z' })).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it('saves without a currency stamp when the settings have none', async () => {
    const { fake, qc } = setup();
    fake.respondWith(ok(row({ unexplained_amount: 1, unexplained_use: 'someone_elses', version: 1 })));
    fake.respondWith(ok(null));
    const { result } = await renderHook(() => useSaveUnexplainedAnswer(USER), { wrapper: wrapper(qc) });
    result.current.save({ amount: 1, use: 'someone_elses', at: 'x' });
    await waitFor(() => expect(undoInsert(fake)).toBeDefined());
    expect(fake.calls.find((c) => c.method === 'upsert')?.args[0]).not.toHaveProperty('currency');
  });
});
