import type { PatchOp, UndoStepDraft } from '@/engine/undo';
import { DbError } from '../errors';
import { UNDO_LOG_COLUMNS, type UndoLogRow } from '../rows';
import { BAD_RESPONSE, applyUndoStep, fetchUndoLog, insertUndoStep, rollbackUndoTo } from '../undoLog';
import { createFakeSupabase } from './fakeSupabase';

const OPS: PatchOp[] = [{ entity: 'transactions', id: 't1', expectedVersion: 3, patch: { deleted_at: null } }];

const STEP: UndoStepDraft = {
  id: 'step-1',
  labelKey: 'deletedMany',
  labelParams: { n: 30 },
  ops: OPS,
  touchedIds: ['t1'],
};

function logRow(overrides: Partial<UndoLogRow> = {}): UndoLogRow {
  return {
    id: 'step-1',
    owner_id: 'u1',
    label_key: 'deletedMany',
    label_params: { n: 30 },
    status: 'available',
    refusal: null,
    created_at: '2026-09-27T00:00:00Z',
    resolved_at: null,
    ...overrides,
  };
}

const CONFLICT = { entity: 'transactions', id: 't1', updated_by: 'u2', record_name: 'Groceries', builtin_key: null, reason: 'changed' };

describe('fetchUndoLog', () => {
  it('selects UNDO_LOG_COLUMNS, filters owner_id and status in (available, refused), orders newest first, limits to 12', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [logRow()], error: null, status: 200 });

    const result = await fetchUndoLog(client, 'u1');

    expect(result).toEqual([logRow()]);
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe(UNDO_LOG_COLUMNS);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['owner_id', 'u1']);
    expect(client.calls.find((c) => c.method === 'in')?.args).toEqual(['status', ['available', 'refused']]);
    expect(client.calls.filter((c) => c.method === 'order').map((c) => c.args)).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(client.calls.find((c) => c.method === 'limit')?.args).toEqual([12]);
  });

  it('returns an empty array when no rows are found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchUndoLog(client, 'u1')).resolves.toEqual([]);
  });

  it('throws a DbError on a query error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(fetchUndoLog(client, 'u1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('insertUndoStep', () => {
  it('inserts exactly {id, label_key, label_params, ops} -- no owner_id, no touched_ids', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 201 });

    await insertUndoStep(client, STEP);

    expect(client.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'step-1',
      label_key: 'deletedMany',
      label_params: { n: 30 },
      ops: [{ entity: 'transactions', id: 't1', expectedVersion: 3, patch: { deleted_at: null } }],
    });
  });

  it('on a 23505 whose id already exists, resolves without error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'duplicate key', code: '23505' }, status: 409 });
    client.respondWith({ data: { id: 'step-1' }, error: null, status: 200 });

    await expect(insertUndoStep(client, STEP)).resolves.toBeUndefined();
  });

  it('on a 23505 whose id is not found on refetch, rethrows the 23505 DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'duplicate key', code: '23505' }, status: 409 });
    client.respondWith({ data: null, error: null, status: 200 });

    await expect(insertUndoStep(client, STEP)).rejects.toMatchObject({ code: '23505' });
  });

  it('rethrows any other insert error as a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });

    await expect(insertUndoStep(client, STEP)).rejects.toMatchObject({ code: 'XX000' });
  });
});

describe('applyUndoStep', () => {
  it('undone: returns {status: "undone"}', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'undone', rows: [] }, error: null, status: 200 });

    await expect(applyUndoStep(client, 'step-1')).resolves.toEqual({ status: 'undone' });
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual(['apply_undo_step', { p_step_id: 'step-1' }]);
  });

  it('already-undone: returns {status: "already-undone"}', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'already-undone' }, error: null, status: 200 });

    await expect(applyUndoStep(client, 'step-1')).resolves.toEqual({ status: 'already-undone' });
  });

  it('not-found: returns {status: "not-found"}', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'not-found' }, error: null, status: 200 });

    await expect(applyUndoStep(client, 'step-1')).resolves.toEqual({ status: 'not-found' });
  });

  it('refused: returns {status: "refused", conflict} with the refusal parsed into an UndoConflict', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'refused', refusal: CONFLICT }, error: null, status: 200 });

    await expect(applyUndoStep(client, 'step-1')).resolves.toEqual({
      status: 'refused',
      conflict: { entity: 'transactions', id: 't1', updatedBy: 'u2', recordName: 'Groceries', builtinKey: null, reason: 'changed' },
    });
  });

  it('an rpc-layer error throws a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(applyUndoStep(client, 'step-1')).rejects.toBeInstanceOf(DbError);
  });

  it('a malformed response throws a DbError with code bad-response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'sideways' }, error: null, status: 200 });

    const err = await applyUndoStep(client, 'step-1').catch((e) => e);
    expect(err).toBeInstanceOf(DbError);
    expect((err as DbError).code).toBe(BAD_RESPONSE);
  });
});

describe('rollbackUndoTo', () => {
  it('undone: returns {status: "undone", undone}', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'undone', undone: 3 }, error: null, status: 200 });

    await expect(rollbackUndoTo(client, 'step-3')).resolves.toEqual({ status: 'undone', undone: 3 });
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual(['rollback_undo_to', { p_step_id: 'step-3' }]);
  });

  it('refused: returns {status: "refused", undone, stepId, conflict}', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'refused', undone: 1, step_id: 'step-2', refusal: CONFLICT }, error: null, status: 200 });

    await expect(rollbackUndoTo(client, 'step-3')).resolves.toEqual({
      status: 'refused',
      undone: 1,
      stepId: 'step-2',
      conflict: { entity: 'transactions', id: 't1', updatedBy: 'u2', recordName: 'Groceries', builtinKey: null, reason: 'changed' },
    });
  });

  it('blocked: returns {status: "blocked", undone, blockedBy, conflict}', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'blocked', undone: 0, blocked_by: 'step-2', refusal: CONFLICT }, error: null, status: 200 });

    await expect(rollbackUndoTo(client, 'step-3')).resolves.toEqual({
      status: 'blocked',
      undone: 0,
      blockedBy: 'step-2',
      conflict: { entity: 'transactions', id: 't1', updatedBy: 'u2', recordName: 'Groceries', builtinKey: null, reason: 'changed' },
    });
  });

  it('blocked: a null refusal maps to conflict: null', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'blocked', undone: 0, blocked_by: 'step-2', refusal: null }, error: null, status: 200 });

    await expect(rollbackUndoTo(client, 'step-3')).resolves.toEqual({
      status: 'blocked',
      undone: 0,
      blockedBy: 'step-2',
      conflict: null,
    });
  });

  it('not-found: returns {status: "not-found"}', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'not-found' }, error: null, status: 200 });

    await expect(rollbackUndoTo(client, 'step-3')).resolves.toEqual({ status: 'not-found' });
  });

  it('an rpc-layer error throws a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(rollbackUndoTo(client, 'step-3')).rejects.toBeInstanceOf(DbError);
  });

  it('a malformed response (missing undone count) throws a DbError with code bad-response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'undone' }, error: null, status: 200 });

    await expect(rollbackUndoTo(client, 'step-3')).rejects.toMatchObject({ code: BAD_RESPONSE });
  });

  it('a malformed response (unrecognised status) throws a DbError with code bad-response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'sideways' }, error: null, status: 200 });

    await expect(rollbackUndoTo(client, 'step-3')).rejects.toMatchObject({ code: BAD_RESPONSE });
  });
});
