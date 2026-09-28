import type { PatchOp, UndoStepDraft } from '@/engine/undo';
import { DbError, VersionConflictError } from '../errors';
import { BAD_RESPONSE, applyPatches, parseConflict, serialiseOps, serialiseStep } from '../patches';
import { createFakeSupabase } from './fakeSupabase';

const OPS: PatchOp[] = [
  { entity: 'transactions', id: 't1', expectedVersion: 3, patch: { status: 'pending' } },
  { entity: 'categories', id: 'c1', expectedVersion: 1, patch: { archived_at: '$now' } },
];

const STEP: UndoStepDraft = {
  id: 'step-1',
  labelKey: 'deletedMany',
  labelParams: { n: 30 },
  ops: OPS,
  touchedIds: ['t1', 'c1'],
};

describe('serialiseOps', () => {
  it('maps each PatchOp to a plain {entity, id, expectedVersion, patch} object', () => {
    expect(serialiseOps(OPS)).toEqual([
      { entity: 'transactions', id: 't1', expectedVersion: 3, patch: { status: 'pending' } },
      { entity: 'categories', id: 'c1', expectedVersion: 1, patch: { archived_at: '$now' } },
    ]);
  });

  it('copies the patch object rather than passing the same reference through', () => {
    const [serialised] = serialiseOps(OPS);
    expect(serialised?.patch).not.toBe(OPS[0]?.patch);
  });
});

describe('serialiseStep', () => {
  it('maps an UndoStepDraft to {id, label_key, label_params, ops}, dropping touchedIds', () => {
    const serialised = serialiseStep(STEP);

    expect(serialised).toEqual({
      id: 'step-1',
      label_key: 'deletedMany',
      label_params: { n: 30 },
      ops: serialiseOps(OPS),
    });
    expect(serialised).not.toHaveProperty('touchedIds');
    expect(serialised).not.toHaveProperty('touched_ids');
  });
});

describe('parseConflict', () => {
  const RAW = {
    entity: 'transactions',
    id: 't1',
    updated_by: 'u2',
    record_name: 'Groceries',
    builtin_key: null,
    reason: 'changed',
  };

  it('maps snake_case fields to the camelCase UndoConflict shape', () => {
    expect(parseConflict(RAW)).toEqual({
      entity: 'transactions',
      id: 't1',
      updatedBy: 'u2',
      recordName: 'Groceries',
      builtinKey: null,
      reason: 'changed',
    });
  });

  it('accepts a not-found reason with null updated_by/record_name', () => {
    expect(
      parseConflict({ entity: 'categories', id: 'c1', updated_by: null, record_name: null, builtin_key: 'housing', reason: 'not-found' })
    ).toEqual({ entity: 'categories', id: 'c1', updatedBy: null, recordName: null, builtinKey: 'housing', reason: 'not-found' });
  });

  it.each([
    ['a string', 'not an object'],
    ['entity outside the undo-entity allowlist', { ...RAW, entity: 'profiles' }],
    ['a non-string id', { ...RAW, id: 42 }],
    ['a non-string, non-null updated_by', { ...RAW, updated_by: 5 }],
    ['a non-string, non-null record_name', { ...RAW, record_name: 5 }],
    ['a non-string, non-null builtin_key', { ...RAW, builtin_key: 5 }],
    ['an unrecognised reason', { ...RAW, reason: 'expired' }],
  ] as const)('throws a DbError with code bad-response for %s', (_description, bad) => {
    expect(() => parseConflict(bad)).toThrow(DbError);
    try {
      parseConflict(bad);
    } catch (err) {
      expect((err as DbError).code).toBe(BAD_RESPONSE);
    }
  });
});

describe('applyPatches', () => {
  it('calls rpc with p_ops serialised and p_undo_step null when no step is given', async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: { status: 'applied', rows: [{ entity: 'transactions', id: 't1', version: 4 }] },
      error: null,
      status: 200,
    });

    const result = await applyPatches(client, OPS);

    expect(result).toEqual([{ entity: 'transactions', id: 't1', version: 4 }]);
    const rpcCall = client.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args).toEqual(['apply_patches', { p_ops: serialiseOps(OPS), p_undo_step: null }]);
  });

  it('sends the undo step as {id, label_key, label_params, ops} when one is given', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'applied', rows: [] }, error: null, status: 200 });

    await applyPatches(client, OPS, STEP);

    const rpcCall = client.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args).toEqual(['apply_patches', { p_ops: serialiseOps(OPS), p_undo_step: serialiseStep(STEP) }]);
  });

  it('applied: returns the rows array as-is', async () => {
    const client = createFakeSupabase();
    const rows = [
      { entity: 'transactions', id: 't1', version: 4 },
      { entity: 'categories', id: 'c1', version: 2 },
    ];
    client.respondWith({ data: { status: 'applied', rows }, error: null, status: 200 });

    await expect(applyPatches(client, OPS)).resolves.toEqual(rows);
  });

  it('conflict: throws VersionConflictError with a parsed UndoConflict as serverRow', async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: {
        status: 'conflict',
        conflict: { entity: 'transactions', id: 't1', updated_by: 'u2', record_name: 'Groceries', builtin_key: null, reason: 'changed' },
      },
      error: null,
      status: 200,
    });

    const err = await applyPatches(client, OPS).catch((e) => e);
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).entity).toBe('transactions');
    expect((err as VersionConflictError).id).toBe('t1');
    expect((err as VersionConflictError).serverRow).toEqual({
      entity: 'transactions',
      id: 't1',
      updatedBy: 'u2',
      recordName: 'Groceries',
      builtinKey: null,
      reason: 'changed',
    });
  });

  it('an rpc error with code 22023 (malformed op) throws a DbError carrying that code', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'invalid patch column', code: '22023' }, status: 400 });

    await expect(applyPatches(client, OPS)).rejects.toMatchObject({ name: 'DbError', code: '22023' });
  });

  it('a malformed response (not an object) throws a DbError with code bad-response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: 'oops', error: null, status: 200 });

    const err = await applyPatches(client, OPS).catch((e) => e);
    expect(err).toBeInstanceOf(DbError);
    expect((err as DbError).code).toBe(BAD_RESPONSE);
  });

  it('a malformed response (rows not an array) throws a DbError with code bad-response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'applied', rows: 'nope' }, error: null, status: 200 });

    await expect(applyPatches(client, OPS)).rejects.toMatchObject({ code: BAD_RESPONSE });
  });

  it('a malformed response (unrecognised status) throws a DbError with code bad-response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'unknown' }, error: null, status: 200 });

    await expect(applyPatches(client, OPS)).rejects.toMatchObject({ code: BAD_RESPONSE });
  });
});
