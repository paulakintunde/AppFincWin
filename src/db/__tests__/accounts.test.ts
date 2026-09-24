import { DbError, NotFoundError, VersionConflictError } from '../errors';
import type { AccountPatch, AccountRow, NewAccount } from '../rows';
import { ACCOUNT_COLUMNS, fetchAccounts, insertAccount, updateAccount } from '../accounts';
import { createFakeSupabase } from './fakeSupabase';

function row(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'a1',
    household_id: 'h1',
    created_by: 'u1',
    name: 'Everyday chequing',
    kind: 'checking',
    currency: 'USD',
    opening_balance: 0,
    archived_at: null,
    version: 1,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

const NEW_ACCOUNT: NewAccount = {
  id: 'a1',
  household_id: 'h1',
  name: 'Everyday chequing',
  kind: 'checking',
  currency: 'USD',
  opening_balance: 0,
};

describe('fetchAccounts', () => {
  it('filters by household_id and orders by name', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [row()], error: null, status: 200 });

    const result = await fetchAccounts(client, 'h1');

    expect(result).toEqual([row()]);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
    expect(client.calls.find((c) => c.method === 'order')?.args).toEqual(['name', { ascending: true }]);
  });
});

describe('insertAccount', () => {
  it('sends only NewAccount keys and selects ACCOUNT_COLUMNS', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: row(), error: null, status: 201 });

    await insertAccount(client, NEW_ACCOUNT);

    expect(client.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 'a1',
      household_id: 'h1',
      name: 'Everyday chequing',
      kind: 'checking',
      currency: 'USD',
      opening_balance: 0,
    });
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe(ACCOUNT_COLUMNS);
  });

  it('on a 23505 duplicate-id error, fetches by id and returns the existing row instead of failing', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'duplicate key', code: '23505' }, status: 409 });
    client.respondWith({ data: row(), error: null, status: 200 });

    await expect(insertAccount(client, NEW_ACCOUNT)).resolves.toEqual(row());
  });

  it('on a 42501 permission error, throws a DbError carrying that code', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'permission denied', code: '42501' }, status: 403 });

    let thrown: unknown;
    try {
      await insertAccount(client, NEW_ACCOUNT);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(DbError);
    expect((thrown as DbError).code).toBe('42501');
  });
});

describe('updateAccount', () => {
  it('issues update(patch).eq(id).eq(version).select(COLUMNS) and returns the row when exactly one comes back', async () => {
    const client = createFakeSupabase();
    const updated = row({ name: 'Renamed', version: 2 });
    client.respondWith({ data: [updated], error: null, status: 200 });

    const result = await updateAccount(client, 'a1', 1, { name: 'Renamed' });

    expect(result).toEqual(updated);
    expect(client.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ name: 'Renamed' });
    const eqCalls = client.calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqCalls).toEqual([
      ['id', 'a1'],
      ['version', 1],
    ]);
  });

  it('throws VersionConflictError with the server row when zero rows come back but the row still exists', async () => {
    const client = createFakeSupabase();
    const serverRow = row({ version: 2 });
    client.respondWith({ data: [], error: null, status: 200 }); // update itself
    client.respondWith({ data: serverRow, error: null, status: 200 }); // fetchAccount lookup

    let thrown: unknown;
    try {
      await updateAccount(client, 'a1', 1, { name: 'Renamed' });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(VersionConflictError);
    expect((thrown as VersionConflictError).serverRow).toEqual(serverRow);
  });

  it('throws NotFoundError when zero rows come back and the row no longer exists', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 }); // update itself
    client.respondWith({ data: null, error: null, status: 200 }); // fetchAccount lookup

    await expect(updateAccount(client, 'a1', 1, { name: 'Renamed' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a patch containing a non-granted key with a TypeError before any network call', async () => {
    const client = createFakeSupabase();
    const patch = { currency: 'EUR' } as unknown as AccountPatch;

    await expect(updateAccount(client, 'a1', 1, patch)).rejects.toThrow(TypeError);
    expect(client.calls).toHaveLength(0);
  });
});
