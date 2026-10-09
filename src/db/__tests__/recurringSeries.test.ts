import { DbError, NotFoundError, VersionConflictError } from '../errors';
import type { RecurringSeriesRow } from '../rows';
import { RECURRING_SERIES_COLUMNS } from '../rows';
import {
  BAD_RESPONSE,
  RECURRING_SERIES_PATCH_KEYS,
  createRecurringSeries,
  createRecurringSeriesBatch,
  SERIES_BATCH_MAX,
  editRecurringSeriesFrom,
  endRecurringSeries,
  fetchRecurringSeries,
  fetchSeriesIdsByCategory,
  SERIES_BY_CATEGORY_MAX,
  parseSeriesChangeSet,
  type NewRecurringSeries,
} from '../recurringSeries';
import { createFakeSupabase } from './fakeSupabase';

function seriesRow(overrides: Partial<RecurringSeriesRow> = {}): RecurringSeriesRow {
  return {
    id: 'series-1',
    household_id: 'hh-1',
    created_by: 'u1',
    updated_by: null,
    account_id: 'acc-1',
    name: 'Rent',
    amount: -100000,
    currency: 'GBP',
    category_id: null,
    payment_type: null,
    freq: 'monthly',
    anchor_date: '2026-09-01',
    time_zone: 'Europe/London',
    end_date: null,
    occurrence_count: null,
    materialised_through: '2026-10-31',
    deleted_at: null,
    is_automatic: false,
    is_sample: false,
    version: 1,
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
    ...overrides,
  };
}

const NEW_SERIES: NewRecurringSeries = {
  id: 'series-1',
  household_id: 'hh-1',
  account_id: 'acc-1',
  name: 'Rent',
  amount: -100000,
  currency: 'GBP',
  category_id: null,
  payment_type: null,
  freq: 'monthly',
  anchor_date: '2026-09-01',
  time_zone: 'Europe/London',
  end_date: null,
  occurrence_count: null,
};

const APPLIED_RESPONSE = {
  status: 'applied',
  series: { id: 'series-1', version: 2, before: { amount: -90000 } },
  inserted: [{ id: 'occ-1', version: 1 }],
  soft_deleted: [{ id: 'occ-0', version: 4 }],
  linked: [{ id: 'occ-2', version: 3 }],
};

describe('fetchRecurringSeries', () => {
  it('filters household_id, excludes soft-deleted series, and orders by name', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [seriesRow()], error: null, status: 200 });

    const result = await fetchRecurringSeries(client, 'hh-1');

    expect(result).toEqual([seriesRow()]);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'hh-1']);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
    expect(client.calls.find((c) => c.method === 'order')?.args).toEqual(['name', { ascending: true }]);
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe(RECURRING_SERIES_COLUMNS);
  });

  it('returns an empty array when no rows are found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchRecurringSeries(client, 'hh-1')).resolves.toEqual([]);
  });
});

describe('parseSeriesChangeSet', () => {
  it('maps an applied response to a SeriesChangeSet, converting version to versionAfter', () => {
    const result = parseSeriesChangeSet(APPLIED_RESPONSE);

    expect(result).toEqual({
      series: { id: 'series-1', versionAfter: 2, before: { amount: -90000 } },
      inserted: [{ id: 'occ-1', version: 1 }],
      softDeleted: [{ id: 'occ-0', versionAfter: 4 }],
      linked: [{ id: 'occ-2', versionAfter: 3 }],
    });
  });

  it('series.before === null means the series itself was created', () => {
    const result = parseSeriesChangeSet({
      status: 'applied',
      series: { id: 'series-1', version: 1, before: null },
      inserted: [{ id: 'occ-1', version: 1 }],
      soft_deleted: [],
      linked: [],
    });

    expect(result.series.before).toBeNull();
  });

  it('throws a DbError with code bad-response when series.id is missing', () => {
    expect(() =>
      parseSeriesChangeSet({ status: 'applied', series: { version: 1, before: null }, inserted: [], soft_deleted: [], linked: [] })
    ).toThrow(DbError);
    try {
      parseSeriesChangeSet({ status: 'applied', series: { version: 1, before: null }, inserted: [], soft_deleted: [], linked: [] });
    } catch (err) {
      expect((err as DbError).code).toBe(BAD_RESPONSE);
    }
  });

  it('throws a DbError when an inserted entry has a non-positive-integer version', () => {
    expect(() =>
      parseSeriesChangeSet({
        status: 'applied',
        series: { id: 'series-1', version: 1, before: null },
        inserted: [{ id: 'occ-1', version: 0 }],
        soft_deleted: [],
        linked: [],
      })
    ).toThrow(DbError);
  });
});

describe('createRecurringSeries', () => {
  it('calls rpc with p_series/p_anchor_transaction_id/p_link_transaction_ids and maps an applied response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: APPLIED_RESPONSE, error: null, status: 200 });

    const result = await createRecurringSeries(client, NEW_SERIES, {
      anchorTransactionId: 'tx-1',
      linkTransactionIds: ['tx-2'],
    });

    expect(result).toEqual({
      status: 'applied',
      changeSet: {
        series: { id: 'series-1', versionAfter: 2, before: { amount: -90000 } },
        inserted: [{ id: 'occ-1', version: 1 }],
        softDeleted: [{ id: 'occ-0', versionAfter: 4 }],
        linked: [{ id: 'occ-2', versionAfter: 3 }],
      },
    });
    const rpcCall = client.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args[0]).toBe('create_recurring_series');
    expect(rpcCall?.args[1]).toEqual({
      p_series: NEW_SERIES,
      p_anchor_transaction_id: 'tx-1',
      p_link_transaction_ids: ['tx-2'],
    });
  });

  it('defaults p_anchor_transaction_id to null and p_link_transaction_ids to [] when link is omitted', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'already-applied', series_id: 'series-1' }, error: null, status: 200 });

    const result = await createRecurringSeries(client, NEW_SERIES);

    expect(result).toEqual({ status: 'already-applied' });
    const rpcCall = client.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args[1]).toEqual({
      p_series: NEW_SERIES,
      p_anchor_transaction_id: null,
      p_link_transaction_ids: [],
    });
  });

  it('passes p_anchor_is_new: true only when the anchor was created in the same action', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: APPLIED_RESPONSE, error: null, status: 200 });

    await createRecurringSeries(client, NEW_SERIES, { anchorTransactionId: 'tx-1', anchorIsNew: true });

    const rpcCall = client.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args[1]).toEqual({
      p_series: NEW_SERIES,
      p_anchor_transaction_id: 'tx-1',
      p_link_transaction_ids: [],
      p_anchor_is_new: true,
    });
  });

  it('omits p_anchor_is_new when the flag is false or absent (server default is false)', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: APPLIED_RESPONSE, error: null, status: 200 });

    await createRecurringSeries(client, NEW_SERIES, { anchorTransactionId: 'tx-1', anchorIsNew: false });

    const rpcCall = client.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args[1]).not.toHaveProperty('p_anchor_is_new');
  });

  it('an RPC error object is thrown as a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });

    await expect(createRecurringSeries(client, NEW_SERIES)).rejects.toBeInstanceOf(DbError);
  });
});

describe('editRecurringSeriesFrom', () => {
  it('rejects a patch naming a key outside RECURRING_SERIES_PATCH_KEYS with a TypeError before any call', async () => {
    const client = createFakeSupabase();
    // @ts-expect-error -- deliberately passing a disallowed key to prove the guard
    await expect(editRecurringSeriesFrom(client, 'series-1', 1, { time_zone: 'UTC' }, '2026-10-01')).rejects.toThrow(TypeError);
    expect(client.calls).toHaveLength(0);
  });

  it('sends p_series_id/p_expected_version/p_patch/p_effective_from and maps an applied response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: APPLIED_RESPONSE, error: null, status: 200 });

    const result = await editRecurringSeriesFrom(client, 'series-1', 1, { amount: -100000 }, '2026-10-01');

    expect(result.status).toBe('applied');
    const rpcCall = client.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args).toEqual([
      'edit_recurring_series_from',
      { p_series_id: 'series-1', p_expected_version: 1, p_patch: { amount: -100000 }, p_effective_from: '2026-10-01' },
    ]);
    expect(RECURRING_SERIES_PATCH_KEYS).toEqual([
      'name',
      'amount',
      'currency',
      'account_id',
      'category_id',
      'payment_type',
      'freq',
      'anchor_date',
      'end_date',
      'occurrence_count',
      'is_automatic',
    ]);
  });

  it("'conflict' throws VersionConflictError('recurring_series', id, conflict)", async () => {
    const conflict = { entity: 'recurring_series', id: 'series-1', updated_by: 'u2', record_name: 'Rent', builtin_key: null, reason: 'changed' };
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'conflict', conflict }, error: null, status: 200 });

    const err = await editRecurringSeriesFrom(client, 'series-1', 1, { amount: -100000 }, '2026-10-01').catch((e) => e);

    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).entity).toBe('recurring_series');
    expect((err as VersionConflictError).id).toBe('series-1');
    // D-IN-05: the conflict payload is validated and mapped exactly as applyPatches does.
    expect((err as VersionConflictError).serverRow).toEqual({
      entity: 'recurring_series',
      id: 'series-1',
      updatedBy: 'u2',
      recordName: 'Rent',
      builtinKey: null,
      reason: 'changed',
    });
  });

  it("'conflict' with a malformed conflict payload is a BAD_RESPONSE DbError (D-IN-05)", async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'conflict', conflict: { entity: 'recurring_series', id: 7 } }, error: null, status: 200 });

    const err = await editRecurringSeriesFrom(client, 'series-1', 1, { amount: -100000 }, '2026-10-01').catch((e) => e);

    expect(err).toBeInstanceOf(DbError);
    expect(err).not.toBeInstanceOf(VersionConflictError);
    expect((err as DbError).code).toBe(BAD_RESPONSE);
  });

  it("'not-found' throws NotFoundError", async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'not-found' }, error: null, status: 200 });

    await expect(editRecurringSeriesFrom(client, 'series-1', 1, { amount: -100000 }, '2026-10-01')).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('a malformed response (missing series.id) throws a DbError with code bad-response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'applied', series: { version: 1, before: null }, inserted: [], soft_deleted: [], linked: [] }, error: null, status: 200 });

    const err = await editRecurringSeriesFrom(client, 'series-1', 1, { amount: -100000 }, '2026-10-01').catch((e) => e);
    expect(err).toBeInstanceOf(DbError);
    expect((err as DbError).code).toBe(BAD_RESPONSE);
  });

  it('an unrecognised status throws a DbError with code bad-response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'unknown-status' }, error: null, status: 200 });

    const err = await editRecurringSeriesFrom(client, 'series-1', 1, { amount: -100000 }, '2026-10-01').catch((e) => e);
    expect(err).toBeInstanceOf(DbError);
    expect((err as DbError).code).toBe(BAD_RESPONSE);
  });
});

describe('endRecurringSeries', () => {
  it('sends p_series_id/p_expected_version/p_end_date and maps an applied response with no inserted rows', async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: {
        status: 'applied',
        series: { id: 'series-1', version: 2, before: { end_date: null } },
        inserted: [],
        soft_deleted: [{ id: 'occ-1', version: 3 }],
        linked: [],
      },
      error: null,
      status: 200,
    });

    const result = await endRecurringSeries(client, 'series-1', 1, '2026-09-30');

    expect(result).toEqual({
      status: 'applied',
      changeSet: {
        series: { id: 'series-1', versionAfter: 2, before: { end_date: null } },
        inserted: [],
        softDeleted: [{ id: 'occ-1', versionAfter: 3 }],
        linked: [],
      },
    });
    const rpcCall = client.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args).toEqual(['end_recurring_series', { p_series_id: 'series-1', p_expected_version: 1, p_end_date: '2026-09-30' }]);
  });

  it('an RPC error object is thrown as a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });

    await expect(endRecurringSeries(client, 'series-1', 1, '2026-09-30')).rejects.toBeInstanceOf(DbError);
  });
});

// D-WR-04: the series RPCs record their own undo step in the same transaction as the write.
describe('server-recorded undo step (D-WR-04)', () => {
  const UNDO = { id: 'step-9', labelKey: 'seriesEdited', labelParams: { name: 'Rent' } } as const;

  it('createRecurringSeries sends p_undo_step and surfaces the recorded step id', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { ...APPLIED_RESPONSE, undo_step_id: 'step-9' }, error: null, status: 200 });

    const result = await createRecurringSeries(client, NEW_SERIES, undefined, { ...UNDO, labelKey: 'seriesCreated' });

    expect(result.status).toBe('applied');
    expect(result.status === 'applied' ? result.undoStepId : null).toBe('step-9');
    const rpcCall = client.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args[1]).toEqual({
      p_series: NEW_SERIES,
      p_anchor_transaction_id: null,
      p_link_transaction_ids: [],
      p_undo_step: { id: 'step-9', label_key: 'seriesCreated', label_params: { name: 'Rent' } },
    });
  });

  it('editRecurringSeriesFrom sends p_undo_step', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { ...APPLIED_RESPONSE, undo_step_id: 'step-9' }, error: null, status: 200 });

    await editRecurringSeriesFrom(client, 'series-1', 1, { amount: -100000 }, '2026-10-01', UNDO);

    const rpcCall = client.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args[1]).toMatchObject({ p_undo_step: { id: 'step-9', label_key: 'seriesEdited', label_params: { name: 'Rent' } } });
  });

  it('endRecurringSeries sends p_undo_step', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { ...APPLIED_RESPONSE, undo_step_id: 'step-9' }, error: null, status: 200 });

    await endRecurringSeries(client, 'series-1', 1, '2026-09-30', { ...UNDO, labelKey: 'seriesEnded' });

    const rpcCall = client.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args[1]).toMatchObject({ p_undo_step: { id: 'step-9', label_key: 'seriesEnded' } });
  });

  it('rejects a malformed undo_step_id in the response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { ...APPLIED_RESPONSE, undo_step_id: 42 }, error: null, status: 200 });

    await expect(endRecurringSeries(client, 'series-1', 1, '2026-09-30', UNDO)).rejects.toBeInstanceOf(DbError);
  });
});

describe('fetchSeriesIdsByCategory (W6-13 WR-05)', () => {
  it('reads live series in the household filed under the category, bounded', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [{ id: 's1', version: 2 }], error: null, status: 200 });
    await expect(fetchSeriesIdsByCategory(client, 'hh-1', 'cat-1')).resolves.toEqual([{ id: 's1', version: 2 }]);
    expect(client.calls.every((c) => c.table === 'recurring_series')).toBe(true);
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['household_id', 'hh-1'],
      ['category_id', 'cat-1'],
    ]);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
    expect(client.calls.find((c) => c.method === 'limit')?.args).toEqual([SERIES_BY_CATEGORY_MAX + 1]);
  });

  it('returns [] for null data and throws a server error as a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchSeriesIdsByCategory(client, 'hh-1', 'cat-1')).resolves.toEqual([]);
    client.respondWith({ data: null, error: { message: 'boom', code: '500' }, status: 500 });
    await expect(fetchSeriesIdsByCategory(client, 'hh-1', 'cat-1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('is_automatic and createRecurringSeriesBatch (D-02, D-19)', () => {
  const UNDO = { id: 'step-1', labelKey: 'seriesCreated' as never, labelParams: {} as never };
  const item = { series: NEW_SERIES, anchorTransactionId: 'tx-1', linkTransactionIds: ['tx-2'] };

  it('is_automatic is a patch key', () => {
    expect(RECURRING_SERIES_PATCH_KEYS).toContain('is_automatic');
  });

  it('sends p_items and p_undo_step and parses an applied response', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'applied', undo_step_id: 'step-1', changes: [APPLIED_RESPONSE] }, error: null, status: 200 });
    const result = await createRecurringSeriesBatch(client, [item], UNDO);
    expect(result).toMatchObject({ status: 'applied', undoStepId: 'step-1' });
    expect(result.status === 'applied' && result.changeSets).toHaveLength(1);
    expect(client.calls.find((c) => c.method === 'rpc')?.args).toEqual([
      'create_recurring_series_batch',
      {
        p_items: [{ series: NEW_SERIES, anchor_transaction_id: 'tx-1', link_transaction_ids: ['tx-2'] }],
        p_undo_step: { id: 'step-1', label_key: 'seriesCreated', label_params: {} },
      },
    ]);
  });

  it('returns already-applied with the step id', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { status: 'already-applied', undo_step_id: 'step-1' }, error: null, status: 200 });
    await expect(createRecurringSeriesBatch(client, [item], UNDO)).resolves.toEqual({ status: 'already-applied', undoStepId: 'step-1' });
  });

  it('rejects 0 and 51 items before any call', async () => {
    const client = createFakeSupabase();
    await expect(createRecurringSeriesBatch(client, [], UNDO)).rejects.toThrow(RangeError);
    await expect(createRecurringSeriesBatch(client, Array(SERIES_BATCH_MAX + 1).fill(item), UNDO)).rejects.toThrow(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('throws BAD_RESPONSE on an unrecognised response and maps a 42501 error', async () => {
    const bad = createFakeSupabase();
    bad.respondWith({ data: { status: 'weird' }, error: null, status: 200 });
    await expect(createRecurringSeriesBatch(bad, [item], UNDO)).rejects.toMatchObject({ code: BAD_RESPONSE });
    const denied = createFakeSupabase();
    denied.respondWith({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });
    await expect(createRecurringSeriesBatch(denied, [item], UNDO)).rejects.toBeInstanceOf(DbError);
  });
});
