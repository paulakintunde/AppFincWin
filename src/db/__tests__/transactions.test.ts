import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { DbError, NotFoundError, VersionConflictError } from '../errors';
import type { NewTransaction, TransactionPatch, TransactionRow } from '../rows';
import {
  MONTH_PAGE_SIZE,
  RATE_RESOLUTION_TIMEOUT_MS,
  TRANSACTION_COLUMNS,
  TRUNCATED_READ,
  fetchTransaction,
  fetchTransactionsForMonth,
  insertTransaction,
  requestRateResolution,
  updateTransaction,
} from '../transactions';
import { createFakeSupabase } from './fakeSupabase';

function row(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 't1',
    household_id: 'h1',
    account_id: 'a1',
    created_by: 'u1',
    original_amount: -1200,
    original_currency: 'USD',
    home_currency: 'USD',
    home_amount: -1200,
    rate: '1',
    orig_per_eur: '1.1',
    home_per_eur: '1.1',
    rate_date: '2026-09-01',
    rate_source: 'frankfurter-v2',
    rate_pending: false,
    local_date: '2026-09-01',
    time_zone: 'America/Vancouver',
    note: null,
    version: 1,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

const NEW_TX: NewTransaction = {
  id: 't1',
  household_id: 'h1',
  account_id: 'a1',
  original_amount: -1200,
  original_currency: 'USD',
  local_date: '2026-09-01',
  time_zone: 'America/Vancouver',
  note: 'coffee',
};

describe('TRANSACTION_COLUMNS', () => {
  it('casts the three numeric rate columns to text so no rate crosses into JS as a float', () => {
    expect(TRANSACTION_COLUMNS).toContain('rate:rate::text');
    expect(TRANSACTION_COLUMNS).toContain('orig_per_eur:orig_per_eur::text');
    expect(TRANSACTION_COLUMNS).toContain('home_per_eur:home_per_eur::text');
  });
});

describe('fetchTransaction', () => {
  it('returns null when no row is found', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: null, status: 200 });
    await expect(fetchTransaction(client, 'missing')).resolves.toBeNull();
  });

  it('throws a DbError on a query error', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(fetchTransaction(client, 't1')).rejects.toBeInstanceOf(DbError);
  });
});

describe('fetchTransactionsForMonth', () => {
  it('filters household_id, bounds local_date to the month, and orders local_date desc then created_at desc', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [row()], error: null, status: 200 });

    const result = await fetchTransactionsForMonth(client, 'h1', '2026-12');

    expect(result).toEqual([row()]);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
    expect(client.calls.find((c) => c.method === 'gte')?.args).toEqual(['local_date', '2026-12-01']);
    expect(client.calls.find((c) => c.method === 'lt')?.args).toEqual(['local_date', '2027-01-01']);
    const orderCalls = client.calls.filter((c) => c.method === 'order');
    expect(orderCalls[0]?.args).toEqual(['local_date', { ascending: false }]);
    expect(orderCalls[1]?.args).toEqual(['created_at', { ascending: false }]);
  });

  it('WR-A12: pages past PostgREST max_rows until the exact count is read -- a big month is never truncated', async () => {
    const client = createFakeSupabase();
    const page1 = Array.from({ length: MONTH_PAGE_SIZE }, (_, i) => row({ id: `a${i}` }));
    const page2 = Array.from({ length: 5 }, (_, i) => row({ id: `b${i}` }));
    client.respondWith({ data: page1, error: null, status: 206, count: MONTH_PAGE_SIZE + 5 });
    client.respondWith({ data: page2, error: null, status: 206 });

    const result = await fetchTransactionsForMonth(client, 'h1', '2026-09');

    expect(result).toHaveLength(MONTH_PAGE_SIZE + 5);
    expect(client.calls.filter((c) => c.method === 'range').map((c) => c.args)).toEqual([
      [0, MONTH_PAGE_SIZE - 1],
      [MONTH_PAGE_SIZE, 2 * MONTH_PAGE_SIZE - 1],
    ]);
    const selects = client.calls.filter((c) => c.method === 'select');
    expect(selects[0]?.args).toEqual([TRANSACTION_COLUMNS, { count: 'exact' }]);
    expect(selects[1]?.args).toEqual([TRANSACTION_COLUMNS]);
    expect(client.calls.filter((c) => c.method === 'order')[2]?.args).toEqual(['id', { ascending: true }]);
  });

  it('WR-A12: keeps paging when the server caps pages below our page size', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [row({ id: 'x1' }), row({ id: 'x2' })], error: null, status: 206, count: 3 });
    client.respondWith({ data: [row({ id: 'x3' })], error: null, status: 206 });

    await expect(fetchTransactionsForMonth(client, 'h1', '2026-09')).resolves.toHaveLength(3);
  });

  it('WR-A12: throws rather than serving a short month as complete', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [row()], error: null, status: 206, count: 4 });
    client.respondWith({ data: [], error: null, status: 206 });

    await expect(fetchTransactionsForMonth(client, 'h1', '2026-09')).rejects.toMatchObject({
      name: 'DbError',
      code: TRUNCATED_READ,
    });
  });

  it('surfaces a page error as a DbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(fetchTransactionsForMonth(client, 'h1', '2026-09')).rejects.toMatchObject({ code: 'XX000', status: 500 });
  });

  it('with an exact count of zero, returns an empty month after one request', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200, count: 0 });
    await expect(fetchTransactionsForMonth(client, 'h1', '2026-09')).resolves.toEqual([]);
    expect(client.calls.filter((c) => c.method === 'range')).toHaveLength(1);
  });
});

describe('insertTransaction', () => {
  it('sends exactly the 8 NewTransaction keys and selects TRANSACTION_COLUMNS', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: row(), error: null, status: 201 });

    await insertTransaction(client, NEW_TX);

    expect(client.calls.find((c) => c.method === 'insert')?.args[0]).toEqual({
      id: 't1',
      household_id: 'h1',
      account_id: 'a1',
      original_amount: -1200,
      original_currency: 'USD',
      local_date: '2026-09-01',
      time_zone: 'America/Vancouver',
      note: 'coffee',
    });
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe(TRANSACTION_COLUMNS);
  });

  it('on a 23505 duplicate-id error, fetches by id and returns the existing row instead of failing', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'duplicate key', code: '23505' }, status: 409 });
    client.respondWith({ data: row(), error: null, status: 200 });

    await expect(insertTransaction(client, NEW_TX)).resolves.toEqual(row());
  });

  it('on a 42501 permission error, throws a DbError carrying that code', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'permission denied', code: '42501' }, status: 403 });

    let thrown: unknown;
    try {
      await insertTransaction(client, NEW_TX);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(DbError);
    expect((thrown as DbError).code).toBe('42501');
  });
});

describe('updateTransaction', () => {
  it('issues update(patch).eq(id).eq(version).select(COLUMNS) and returns the row when exactly one comes back', async () => {
    const client = createFakeSupabase();
    const updated = row({ note: 'x', version: 4 });
    client.respondWith({ data: [updated], error: null, status: 200 });

    const result = await updateTransaction(client, 't1', 3, { note: 'x' });

    expect(result).toEqual(updated);
    expect(client.calls.find((c) => c.method === 'update')?.args[0]).toEqual({ note: 'x' });
    const eqCalls = client.calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqCalls).toEqual([
      ['id', 't1'],
      ['version', 3],
    ]);
  });

  it('throws VersionConflictError with the server row when zero rows come back but the row still exists', async () => {
    const client = createFakeSupabase();
    const serverRow = row({ version: 4 });
    client.respondWith({ data: [], error: null, status: 200 }); // update itself
    client.respondWith({ data: serverRow, error: null, status: 200 }); // fetchTransaction lookup

    let thrown: unknown;
    try {
      await updateTransaction(client, 't1', 3, { note: 'x' });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(VersionConflictError);
    expect((thrown as VersionConflictError).serverRow).toEqual(serverRow);
  });

  it('throws NotFoundError when zero rows come back and the row no longer exists', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 }); // update itself
    client.respondWith({ data: null, error: null, status: 200 }); // fetchTransaction lookup

    await expect(updateTransaction(client, 't1', 3, { note: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a patch containing a non-granted key with a TypeError before any network call', async () => {
    const client = createFakeSupabase();
    const patch = { home_amount: 500 } as unknown as TransactionPatch;

    await expect(updateTransaction(client, 't1', 3, patch)).rejects.toThrow(TypeError);
    expect(client.calls).toHaveLength(0);
  });
});

describe('requestRateResolution', () => {
  it("invokes functions 'resolve-rate' with body { transactionId } and returns data.row", async () => {
    const client = createFakeSupabase();
    const resolved = row({ rate_pending: false });
    client.respondWith({ data: { row: resolved }, error: null, status: 200 });

    const result = await requestRateResolution(client, 't1');

    expect(result).toEqual(resolved);
    expect(client.calls.find((c) => c.method === 'functions.invoke')?.args).toEqual([
      'resolve-rate',
      { body: { transactionId: 't1' }, timeout: RATE_RESOLUTION_TIMEOUT_MS },
    ]);
  });

  it('returns null when the response carries no row', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: {}, error: null, status: 200 });
    await expect(requestRateResolution(client, 't1')).resolves.toBeNull();
  });

  it('rethrows a FunctionsFetchError since a network failure is transient', async () => {
    const client = createFakeSupabase();
    const fetchError = new FunctionsFetchError({ requestId: 'r1' });
    client.respondWith({ data: null, error: fetchError, status: 0 });

    await expect(requestRateResolution(client, 't1')).rejects.toBe(fetchError);
  });

  it('returns null on an HTTP-layer error from the function', async () => {
    const client = createFakeSupabase();
    const httpError = new FunctionsHttpError({ status: 500 });
    client.respondWith({ data: null, error: httpError, status: 500 });

    await expect(requestRateResolution(client, 't1')).resolves.toBeNull();
  });
});
