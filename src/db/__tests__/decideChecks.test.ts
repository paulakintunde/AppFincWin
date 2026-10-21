import { DbError, NotFoundError, VersionConflictError } from '../errors';
import {
  DECIDE_CHECK_INSERT_KEYS,
  DECIDE_CHECK_PATCH_KEYS,
  fetchDecideChecks,
  insertDecideCheck,
  saveDecideCheckDraft,
  updateDecideCheck,
  type DecideCheckPatch,
  type DecideCheckRow,
  type NewDecideCheck,
} from '../decideChecks';
import { createFakeSupabase } from './fakeSupabase';

function checkRow(overrides: Partial<DecideCheckRow> = {}): DecideCheckRow {
  return {
    id: 'k1',
    household_id: 'h1',
    created_by: 'u1',
    kind: 'buy',
    name: 'Laptop',
    inputs: { kind: 'buy' },
    status: 'open',
    furthest_step: 1,
    last_seen_state: null,
    last_seen_basis: null,
    reopened_from: null,
    decided_at: null,
    verdict_at_decision: null,
    estimate_day_one: null,
    estimate_monthly: null,
    wait_monthly: null,
    ready_by: null,
    broke_line: false,
    cooling_off_at: null,
    estimate_monthly_payment: null,
    estimate_running: null,
    is_sample: false,
    deleted_at: null,
    version: 1,
    updated_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const NEW_CHECK: NewDecideCheck = {
  id: 'k1',
  household_id: 'h1',
  kind: 'buy',
  name: 'Laptop',
  inputs: { kind: 'buy' },
  furthest_step: 1,
};

describe('key lists', () => {
  it('never name decision state, estimates or is_sample', () => {
    for (const key of [...DECIDE_CHECK_INSERT_KEYS, ...DECIDE_CHECK_PATCH_KEYS]) {
      expect(key).not.toMatch(/status|decided_at|estimate|is_sample|wait_monthly|ready_by|cooling_off|broke_line|verdict_at/);
    }
    expect(DECIDE_CHECK_PATCH_KEYS).toContain('kind');
  });
});

describe('fetchDecideChecks', () => {
  it('selects live rows newest-updated first', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [checkRow()], error: null, status: 200 });
    await expect(fetchDecideChecks(client, 'h1')).resolves.toEqual([checkRow()]);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
    expect(client.calls.find((c) => c.method === 'order')?.args).toEqual(['updated_at', { ascending: false }]);
  });

  it('maps an error to a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: '500' }, status: 500 });
    await expect(fetchDecideChecks(client, 'h1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('insertDecideCheck', () => {
  it('returns the stored row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: checkRow(), error: null, status: 201 });
    await expect(insertDecideCheck(client, NEW_CHECK)).resolves.toEqual(checkRow());
  });

  it('returns the existing row on a duplicate id (replay)', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    client.respondWith({ data: checkRow(), error: null, status: 200 });
    await expect(insertDecideCheck(client, NEW_CHECK)).resolves.toEqual(checkRow());
  });

  it('rejects a key outside the insert list before any request', async () => {
    const client = createFakeSupabase();
    await expect(insertDecideCheck(client, { ...NEW_CHECK, status: 'bought' } as unknown as NewDecideCheck)).rejects.toBeInstanceOf(
      TypeError
    );
    expect(client.calls).toHaveLength(0);
  });
});

describe('saveDecideCheckDraft', () => {
  it('updates by id while open, without a version filter', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [checkRow({ furthest_step: 2 })], error: null, status: 200 });
    await expect(saveDecideCheckDraft(client, 'k1', { furthest_step: 2 })).resolves.toMatchObject({ furthest_step: 2 });
    const eqs = client.calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['id', 'k1']);
    expect(eqs).toContainEqual(['status', 'open']);
    expect(eqs.some((a) => a[0] === 'version')).toBe(false);
  });

  it('sends kind in the same update when inputs.kind is valid', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [checkRow({ kind: 'invest' })], error: null, status: 200 });
    await saveDecideCheckDraft(client, 'k1', { inputs: { kind: 'invest' } });
    expect(client.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ inputs: { kind: 'invest' }, kind: 'invest' });
  });

  it('sends no kind when inputs.kind is missing or invalid', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [checkRow()], error: null, status: 200 });
    await saveDecideCheckDraft(client, 'k1', { inputs: { kind: 'other' } });
    expect(client.calls.find((c) => c.method === 'update')?.args[0]).not.toHaveProperty('kind');
  });

  it('throws NotFoundError on zero rows', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    await expect(saveDecideCheckDraft(client, 'k1', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('updateDecideCheck', () => {
  it('rejects non-patchable columns before any request', async () => {
    const client = createFakeSupabase();
    await expect(updateDecideCheck(client, 'k1', 1, { status: 'bought' } as unknown as DecideCheckPatch)).rejects.toBeInstanceOf(
      TypeError
    );
    expect(client.calls).toHaveLength(0);
  });

  it('throws VersionConflictError carrying the server row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: checkRow({ version: 4 }), error: null, status: 200 });
    const err = await updateDecideCheck(client, 'k1', 1, { name: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).serverRow).toMatchObject({ version: 4 });
  });

  it('throws NotFoundError when the row is gone', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(updateDecideCheck(client, 'k1', 1, { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
