import { DbError, NotFoundError, VersionConflictError } from '../errors';
import type { CategoryRow } from '../rows';
import { CATEGORY_COLUMNS } from '../rows';
import {
  CATEGORY_INSERT_KEYS,
  CATEGORY_PATCH_KEYS,
  fetchCategories,
  fetchCategory,
  insertCategory,
  updateCategory,
  type NewCategory,
} from '../categories';
import { createFakeSupabase } from './fakeSupabase';

function categoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 'cat-1',
    owner_id: 'u1',
    builtin_key: null,
    name: 'Groceries',
    color_key: 'green',
    is_system: false,
    archived_at: null,
    version: 1,
    updated_by: null,
    created_at: '2026-09-24T00:00:00Z',
    updated_at: '2026-09-24T00:00:00Z',
    ...overrides,
  };
}

const NEW_CATEGORY: NewCategory = { id: 'cat-1', name: 'Groceries', color_key: 'green' };

describe('fetchCategory', () => {
  it('returns null when no row is found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchCategory(client, 'missing')).resolves.toBeNull();
  });

  it('throws a DbError on a query error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(fetchCategory(client, 'cat-1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('fetchCategories', () => {
  it('filters owner_id and orders by created_at ascending', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [categoryRow()], error: null, status: 200 });

    const result = await fetchCategories(client, 'u1');

    expect(result).toEqual([categoryRow()]);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['owner_id', 'u1']);
    expect(client.calls.find((c) => c.method === 'order')?.args).toEqual(['created_at', { ascending: true }]);
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe(CATEGORY_COLUMNS);
  });

  it('returns an empty array when no rows are found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchCategories(client, 'u1')).resolves.toEqual([]);
  });
});

describe('insertCategory', () => {
  it('sends exactly the 3 granted keys (no is_system/builtin_key) and selects CATEGORY_COLUMNS', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: categoryRow(), error: null, status: 201 });

    await insertCategory(client, NEW_CATEGORY);

    expect(CATEGORY_INSERT_KEYS).toEqual(['id', 'name', 'color_key']);
    expect(client.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'cat-1',
      name: 'Groceries',
      color_key: 'green',
    });
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe(CATEGORY_COLUMNS);
  });

  it('on a 23505 duplicate-id error, fetches by id and returns the existing row instead of failing', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'duplicate key', code: '23505' }, status: 409 });
    client.respondWith({ data: categoryRow(), error: null, status: 200 });

    await expect(insertCategory(client, NEW_CATEGORY)).resolves.toEqual(categoryRow());
  });

  it('CR-A03: a 23505 from another constraint -- no row with this id exists -- rethrows the 23505 DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: null,
      error: { message: 'duplicate key value violates unique constraint', code: '23505' },
      status: 409,
    });
    client.respondWith({ data: null, error: null, status: 200 }); // fetch by id: not ours

    await expect(insertCategory(client, NEW_CATEGORY)).rejects.toMatchObject({ name: 'DbError', code: '23505', status: 409 });
  });
});

describe('updateCategory', () => {
  it('rejects a patch naming is_system with a TypeError before any network call', async () => {
    const client = createFakeSupabase();
    // @ts-expect-error -- deliberately passing a disallowed key to prove the guard
    await expect(updateCategory(client, 'cat-1', 1, { is_system: true })).rejects.toThrow(TypeError);
    expect(client.calls).toHaveLength(0);
  });

  it('rejects a patch naming builtin_key with a TypeError before any network call', async () => {
    const client = createFakeSupabase();
    // @ts-expect-error -- deliberately passing a disallowed key to prove the guard
    await expect(updateCategory(client, 'cat-1', 1, { builtin_key: 'groceries' })).rejects.toThrow(TypeError);
    expect(client.calls).toHaveLength(0);
  });

  it('is version-conditional: sends eq(version, expectedVersion) and returns the updated row on success', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [categoryRow({ version: 2, name: 'Renamed' })], error: null, status: 200 });

    const result = await updateCategory(client, 'cat-1', 1, { name: 'Renamed' });

    expect(result.version).toBe(2);
    expect(client.calls.find((c) => c.method === 'eq' && c.args[0] === 'version')?.args).toEqual(['version', 1]);
    expect(CATEGORY_PATCH_KEYS).toEqual(['name', 'color_key', 'archived_at']);
  });

  it('zero rows back with the row still present throws VersionConflictError carrying the server row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: categoryRow({ version: 5 }), error: null, status: 200 });

    const err = await updateCategory(client, 'cat-1', 1, { name: 'Renamed' }).catch((e) => e);
    expect(err).toBeInstanceOf(VersionConflictError);
    expect((err as VersionConflictError).serverRow).toEqual(categoryRow({ version: 5 }));
  });

  it('zero rows back with the row gone throws NotFoundError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    client.respondWith({ data: null, error: null, status: 200 });

    await expect(updateCategory(client, 'cat-1', 1, { name: 'Renamed' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
