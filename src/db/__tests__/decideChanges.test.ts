import { DbError, NotFoundError, VersionConflictError } from '../errors';
import {
  DECIDE_CHANGE_COLUMNS,
  DECIDE_CHANGE_INSERT_KEYS,
  DECIDE_CHANGE_PATCH_KEYS,
  fetchDecideChanges,
  insertDecideChange,
  updateDecideChange,
  type DecideChangePatch,
  type DecideChangeRow,
  type NewDecideChange,
} from '../decideChanges';
import { createFakeSupabase } from './fakeSupabase';

function changeRow(overrides: Partial<DecideChangeRow> = {}): DecideChangeRow {
  return {
    id: 'c1',
    household_id: 'h1',
    created_by: 'u1',
    updated_by: null,
    kind: 'spending',
    name: 'Gym',
    monthly_amount: -4500,
    currency: 'GBP',
    start_month: '2026-11',
    end_month: null,
    is_sample: false,
    deleted_at: null,
    version: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const NEW_CHANGE: NewDecideChange = {
  id: 'c1',
  household_id: 'h1',
  kind: 'spending',
  name: 'Gym',
  monthly_amount: -4500,
  currency: 'GBP',
  start_month: '2026-11',
  end_month: null,
};

describe('fetchDecideChanges', () => {
  it('selects live rows of the household ordered by start_month then created_at', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [changeRow()], error: null, status: 200 });
    await expect(fetchDecideChanges(client, 'h1')).resolves.toEqual([changeRow()]);
    expect(client.calls.find((c) => c.method === 'select')?.args).toEqual([DECIDE_CHANGE_COLUMNS]);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
    expect(client.calls.filter((c) => c.method === 'order').map((c) => c.args[0])).toEqual(['start_month', 'created_at']);
  });

  it('maps an error to a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: '500' }, status: 500 });
    await expect(fetchDecideChanges(client, 'h1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('insertDecideChange', () => {
  it('key lists never carry server-owned columns', () => {
    for (const k of [...DECIDE_CHANGE_INSERT_KEYS, ...DECIDE_CHANGE_PATCH_KEYS]) {
      expect(['is_sample', 'created_by', 'version']).not.toContain(k);
    }
  });

  it('writes only the insert keys', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: changeRow(), error: null, status: 201 });
    await insertDecideChange(client, NEW_CHANGE);
    const sent = client.calls.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([...DECIDE_CHANGE_INSERT_KEYS].sort());
  });

  it('throws before any request on a key outside the insert list', async () => {
    const client = createFakeSupabase();
    await expect(insertDecideChange(client, { ...NEW_CHANGE, is_sample: true } as NewDecideChange)).rejects.toBeInstanceOf(TypeError);
    expect(client.calls).toHaveLength(0);
  });

  it.each([
    ['zero amount', { monthly_amount: 0 }],
    ['fractional amount', { monthly_amount: 10.5 }],
    ['bad start month', { start_month: '2026-13' }],
    ['bad end month', { end_month: '2026-1' }],
    ['end before start', { end_month: '2026-10' }],
  ])('rejects %s with RangeError before any request', async (_label, over) => {
    const client = createFakeSupabase();
    await expect(insertDecideChange(client, { ...NEW_CHANGE, ...over })).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('returns the existing row on a duplicate id (replay)', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    client.respondWith({ data: changeRow(), error: null, status: 200 });
    await expect(insertDecideChange(client, NEW_CHANGE)).resolves.toEqual(changeRow());
  });

  it('rethrows a duplicate whose row cannot be found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'dup', code: '23505' }, status: 409 });
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(insertDecideChange(client, NEW_CHANGE)).rejects.toBeInstanceOf(DbError);
  });
});

describe('updateDecideChange', () => {
  it('rejects non-patchable columns before any request', async () => {
    const client = createFakeSupabase();
    for (const key of ['household_id', 'id', 'is_sample']) {
      await expect(updateDecideChange(client, 'c1', 1, { [key]: 'x' } as DecideChangePatch)).rejects.toBeInstanceOf(TypeError);
    }
    expect(client.calls).toHaveLength(0);
  });

  it('validates amount and months in a patch', async () => {
    const client = createFakeSupabase();
    await expect(updateDecideChange(client, 'c1', 1, { monthly_amount: 0 })).rejects.toBeInstanceOf(RangeError);
    await expect(updateDecideChange(client, 'c1', 1, { start_month: '2026-00' })).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('returns the updated row, checking the version', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [changeRow({ version: 2 })], error: null, status: 200 });
    await expect(updateDecideChange(client, 'c1', 1, { name: 'x' })).resolves.toMatchObject({ version: 2 });
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['version', 1]);
  });

  it('throws VersionConflictError when the row is at another version', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: changeRow({ version: 5 }), error: null, status: 200 });
    await expect(updateDecideChange(client, 'c1', 1, { name: 'x' })).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('throws NotFoundError when the row is gone', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(updateDecideChange(client, 'c1', 1, { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
