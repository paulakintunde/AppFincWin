import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { isResolveRateThrottled, resetResolveRateBackoffForTests } from '@/data/sync/resolveRateBackoff';
import { DbError, NotFoundError, VersionConflictError } from '../errors';
import type { NewTransaction, TransactionPatch, TransactionRow } from '../rows';
import {
  ACTIVE_VIEW,
  IMPORT_CHUNK_MAX,
  MERGE_LIMIT,
  MONTH_PAGE_SIZE,
  RATE_RESOLUTION_TIMEOUT_MS,
  SEARCH_LIMIT,
  TRANSACTION_COLUMNS,
  TRANSACTION_INSERT_KEYS,
  TRANSACTION_PATCH_KEYS,
  TRANSFER_LEGS_MAX,
  TRUNCATED_READ,
  escapeLikeTerm,
  fetchActiveIdsByCategory,
  fetchCategorisedNames,
  fetchHasRowsBefore,
  fetchTransaction,
  fetchTransactionsForMonth,
  fetchTransactionsSearch,
  fetchTransferCandidates,
  fetchTransferLegs,
  insertTransaction,
  insertTransactionsBatch,
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
    orig_custom_unit_value: null,
    orig_custom_ref_per_eur: null,
    home_custom_unit_value: null,
    home_custom_ref_per_eur: null,
    rate_date: '2026-09-01',
    rate_source: 'frankfurter-v2',
    rate_pending: false,
    local_date: '2026-09-01',
    time_zone: 'America/Vancouver',
    note: null,
    name: null,
    category_id: null,
    payment_type: null,
    status: 'paid',
    deleted_at: null,
    import_batch_id: null,
    recurring_series_id: null,
    occurrence_date: null,
    updated_by: null,
    raw_amount: null,
    raw_balance: null,
    external_id: null,
    import_format: null,
    transfer_id: null,
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

  it('RD-03 follow-up: casts the four raw custom-leg stamp columns to text too', () => {
    expect(TRANSACTION_COLUMNS).toContain('orig_custom_unit_value:orig_custom_unit_value::text');
    expect(TRANSACTION_COLUMNS).toContain('orig_custom_ref_per_eur:orig_custom_ref_per_eur::text');
    expect(TRANSACTION_COLUMNS).toContain('home_custom_unit_value:home_custom_unit_value::text');
    expect(TRANSACTION_COLUMNS).toContain('home_custom_ref_per_eur:home_custom_ref_per_eur::text');
  });

  it('RD-03 follow-up: the four raw custom-leg stamp columns stay out of both write-key lists', () => {
    for (const col of [
      'orig_custom_unit_value',
      'orig_custom_ref_per_eur',
      'home_custom_unit_value',
      'home_custom_ref_per_eur',
    ]) {
      expect(TRANSACTION_INSERT_KEYS).not.toContain(col);
      expect(TRANSACTION_PATCH_KEYS).not.toContain(col);
    }
  });

  it('Record (Phase 2): includes the new record fields', () => {
    for (const col of [
      'name',
      'category_id',
      'payment_type',
      'status',
      'deleted_at',
      'import_batch_id',
      'recurring_series_id',
      'occurrence_date',
      'updated_by',
    ]) {
      expect(TRANSACTION_COLUMNS).toContain(col);
    }
  });

  it('D-45: includes the statement-import provenance columns', () => {
    for (const col of ['raw_amount', 'raw_balance', 'external_id', 'import_format', 'transfer_id']) {
      expect(TRANSACTION_COLUMNS).toContain(col);
    }
  });

  it('D-45: the four write-only provenance fields are insert-only, never in TRANSACTION_PATCH_KEYS', () => {
    for (const col of ['raw_amount', 'raw_balance', 'external_id', 'import_format']) {
      expect(TRANSACTION_INSERT_KEYS).toContain(col);
      expect(TRANSACTION_PATCH_KEYS).not.toContain(col);
    }
    // transfer_id IS patchable (editing/deleting a transfer, D-50/D-51).
    expect(TRANSACTION_PATCH_KEYS).toContain('transfer_id');
  });

  it("Record fields recurring_series_id/occurrence_date/updated_by are server-only (read-only, never in a write-key list)", () => {
    for (const col of ['recurring_series_id', 'occurrence_date', 'updated_by']) {
      expect(TRANSACTION_INSERT_KEYS).not.toContain(col);
      expect(TRANSACTION_PATCH_KEYS).not.toContain(col);
    }
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

  it('still reads the raw table (not ACTIVE_VIEW), so a conflict lookup can see tombstones', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: row(), error: null, status: 200 });
    await fetchTransaction(client, 't1');
    expect(client.calls.every((c) => c.table === 'transactions')).toBe(true);
    expect(client.calls.some((c) => c.table === ACTIVE_VIEW)).toBe(false);
  });
});

describe('fetchTransactionsForMonth', () => {
  it('reads from ACTIVE_VIEW (transactions_active), never the raw table (D-30)', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [row()], error: null, status: 200 });
    await fetchTransactionsForMonth(client, 'h1', '2026-12');
    expect(client.calls.every((c) => c.table === ACTIVE_VIEW)).toBe(true);
  });

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

  it('omits Record/provenance keys left undefined -- an old caller never sends status/name/etc as undefined', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: row(), error: null, status: 201 });

    await insertTransaction(client, NEW_TX);

    const sent = client.calls.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>;
    for (const col of [
      'name',
      'category_id',
      'payment_type',
      'status',
      'import_batch_id',
      'raw_amount',
      'raw_balance',
      'external_id',
      'import_format',
      'transfer_id',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(sent, col)).toBe(false);
    }
  });

  it('sends the new Record/provenance keys when the caller sets them', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: row(), error: null, status: 201 });

    await insertTransaction(client, {
      ...NEW_TX,
      name: 'Netflix',
      category_id: 'cat-1',
      payment_type: 'card',
      status: 'paid',
      import_batch_id: 'batch-1',
      raw_amount: '-10.99',
      raw_balance: '1200.00',
      external_id: 'fitid-1',
      import_format: 'ofx',
      transfer_id: null,
    });

    const sent = client.calls.find((c) => c.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(sent).toMatchObject({
      name: 'Netflix',
      category_id: 'cat-1',
      payment_type: 'card',
      status: 'paid',
      import_batch_id: 'batch-1',
      raw_amount: '-10.99',
      raw_balance: '1200.00',
      external_id: 'fitid-1',
      import_format: 'ofx',
      transfer_id: null,
    });
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

  it('accepts a status patch (D-06 mark-paid)', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [row({ status: 'paid' })], error: null, status: 200 });
    await expect(updateTransaction(client, 't1', 3, { status: 'paid' })).resolves.toMatchObject({ status: 'paid' });
  });

  it('accepts a deleted_at patch (D-30 soft delete)', async () => {
    const client = createFakeSupabase();
    const deletedAt = '2026-09-27T00:00:00Z';
    client.respondWith({ data: [row({ deleted_at: deletedAt })], error: null, status: 200 });
    await expect(updateTransaction(client, 't1', 3, { deleted_at: deletedAt })).resolves.toMatchObject({
      deleted_at: deletedAt,
    });
  });

  it('rejects a recurring_series_id patch with a TypeError before any network call (server-only column)', async () => {
    const client = createFakeSupabase();
    const patch = { recurring_series_id: 'series-1' } as unknown as TransactionPatch;

    await expect(updateTransaction(client, 't1', 3, patch)).rejects.toThrow(TypeError);
    expect(client.calls).toHaveLength(0);
  });

  it('rejects a raw_amount patch with a TypeError before any network call (D-45 insert-only provenance)', async () => {
    const client = createFakeSupabase();
    const patch = { raw_amount: 'x' } as unknown as TransactionPatch;

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

  describe('RD-05: rate-limited (429) response', () => {
    beforeEach(() => resetResolveRateBackoffForTests());
    afterEach(() => resetResolveRateBackoffForTests());

    it('returns null (never throws) on a 429 from resolve-rate\'s own throttle', async () => {
      const client = createFakeSupabase();
      const httpError = new FunctionsHttpError({ status: 429 });
      client.respondWith({ data: null, error: httpError, status: 429 });

      await expect(requestRateResolution(client, 't1')).resolves.toBeNull();
    });

    it('notes the client-side backoff so a later caller can skip the follow-up entirely', async () => {
      const client = createFakeSupabase();
      const httpError = new FunctionsHttpError({ status: 429 });
      client.respondWith({ data: null, error: httpError, status: 429 });

      expect(isResolveRateThrottled()).toBe(false);
      await requestRateResolution(client, 't1');
      expect(isResolveRateThrottled()).toBe(true);
    });

    it('a plain 500 (not rate-limited) never triggers the backoff', async () => {
      const client = createFakeSupabase();
      const httpError = new FunctionsHttpError({ status: 500 });
      client.respondWith({ data: null, error: httpError, status: 500 });

      await requestRateResolution(client, 't1');
      expect(isResolveRateThrottled()).toBe(false);
    });
  });
});

describe('escapeLikeTerm', () => {
  it('backslash-escapes backslash, percent and underscore', () => {
    expect(escapeLikeTerm('50%_off')).toBe('50\\%\\_off');
    expect(escapeLikeTerm('a\\b')).toBe('a\\\\b');
  });
});

describe('fetchTransactionsSearch', () => {
  it("reads ACTIVE_VIEW, sends the escaped ilike pattern '%50\\%\\_off%', ordered, limited to SEARCH_LIMIT by default", async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [row()], error: null, status: 200 });

    await fetchTransactionsSearch(client, 'h1', '50%_off');

    expect(client.calls.every((c) => c.table === ACTIVE_VIEW)).toBe(true);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
    expect(client.calls.find((c) => c.method === 'ilike')?.args).toEqual(['name', '%50\\%\\_off%']);
    expect(client.calls.find((c) => c.method === 'limit')?.args).toEqual([SEARCH_LIMIT]);
  });

  it('trims the term before searching', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });

    await fetchTransactionsSearch(client, 'h1', '  coffee  ');

    expect(client.calls.find((c) => c.method === 'ilike')?.args).toEqual(['name', '%coffee%']);
  });

  it('throws a RangeError on an empty (or whitespace-only) term, before any network call', async () => {
    const client = createFakeSupabase();
    await expect(fetchTransactionsSearch(client, 'h1', '   ')).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('accepts a custom limit', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    await fetchTransactionsSearch(client, 'h1', 'coffee', 50);
    expect(client.calls.find((c) => c.method === 'limit')?.args).toEqual([50]);
  });
});

describe('fetchTransferCandidates', () => {
  it("queries ACTIVE_VIEW with eq household_id, is('transfer_id', null), neq('account_id', excludeAccountId), gte/lte local_date and the transfer-candidate select list", async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });

    await fetchTransferCandidates(client, 'h1', { excludeAccountId: 'a1', from: '2026-09-01', toInclusive: '2026-09-05' });

    expect(client.calls.every((c) => c.table === ACTIVE_VIEW)).toBe(true);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
    expect(client.calls.find((c) => c.method === 'is')?.args).toEqual(['transfer_id', null]);
    expect(client.calls.find((c) => c.method === 'neq')?.args).toEqual(['account_id', 'a1']);
    expect(client.calls.find((c) => c.method === 'gte')?.args).toEqual(['local_date', '2026-09-01']);
    expect(client.calls.find((c) => c.method === 'lte')?.args).toEqual(['local_date', '2026-09-05']);
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe(
      'id, account_id, local_date, original_amount, original_currency, name, payment_type, transfer_id, category_id, version'
    );
  });
});

describe('fetchHasRowsBefore', () => {
  it("selects 'id' from ACTIVE_VIEW, eq household_id, eq account_id, lt local_date, limit 1", async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [{ id: 't1' }], error: null, status: 200 });

    const result = await fetchHasRowsBefore(client, 'h1', 'a1', '2026-09-01');

    expect(result).toBe(true);
    expect(client.calls.every((c) => c.table === ACTIVE_VIEW)).toBe(true);
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe('id');
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['household_id', 'h1'],
      ['account_id', 'a1'],
    ]);
    expect(client.calls.find((c) => c.method === 'lt')?.args).toEqual(['local_date', '2026-09-01']);
    expect(client.calls.find((c) => c.method === 'limit')?.args).toEqual([1]);
  });

  it('returns false when no row comes back', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    await expect(fetchHasRowsBefore(client, 'h1', 'a1', '2026-09-01')).resolves.toBe(false);
  });
});

describe('fetchTransferLegs', () => {
  it("queries ACTIVE_VIEW with eq household_id and in('transfer_id', ids)", async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [row(), row({ id: 't2' })], error: null, status: 200 });

    await fetchTransferLegs(client, 'h1', ['tr-1']);

    expect(client.calls.every((c) => c.table === ACTIVE_VIEW)).toBe(true);
    expect(client.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
    expect(client.calls.find((c) => c.method === 'in')?.args).toEqual(['transfer_id', ['tr-1']]);
  });

  it('returns [] without any call for an empty id list', async () => {
    const client = createFakeSupabase();
    await expect(fetchTransferLegs(client, 'h1', [])).resolves.toEqual([]);
    expect(client.calls).toHaveLength(0);
  });

  it(`throws a RangeError for more than TRANSFER_LEGS_MAX (${TRANSFER_LEGS_MAX}) ids`, async () => {
    const client = createFakeSupabase();
    const ids = Array.from({ length: TRANSFER_LEGS_MAX + 1 }, (_, i) => `tr-${i}`);
    await expect(fetchTransferLegs(client, 'h1', ids)).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });
});

describe('fetchCategorisedNames', () => {
  it('filters created_by = userId and non-null category_id/name', async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: [{ name: 'Netflix', category_id: 'cat-1', updated_at: '2026-09-01T00:00:00Z' }],
      error: null,
      status: 200,
    });

    await fetchCategorisedNames(client, 'h1', 'u1');

    expect(client.calls.every((c) => c.table === ACTIVE_VIEW)).toBe(true);
    expect(client.calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['household_id', 'h1'],
      ['created_by', 'u1'],
    ]);
    expect(client.calls.filter((c) => c.method === 'not').map((c) => c.args)).toEqual([
      ['category_id', 'is', null],
      ['name', 'is', null],
    ]);
  });
});

describe('fetchActiveIdsByCategory', () => {
  it(`returns {id, version, local_date} rows, limited to MERGE_LIMIT + 1 (${MERGE_LIMIT + 1})`, async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [{ id: 't1', version: 1, local_date: '2026-09-01' }], error: null, status: 200 });

    await fetchActiveIdsByCategory(client, 'h1', 'cat-1');

    expect(client.calls.every((c) => c.table === ACTIVE_VIEW)).toBe(true);
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe('id, version, local_date');
    expect(client.calls.find((c) => c.method === 'eq' && c.args[0] === 'category_id')?.args).toEqual([
      'category_id',
      'cat-1',
    ]);
    expect(client.calls.find((c) => c.method === 'limit')?.args).toEqual([MERGE_LIMIT + 1]);
  });
});

describe('insertTransactionsBatch', () => {
  const chunkRow = (id: string): NewTransaction => ({ ...NEW_TX, id, status: 'paid', import_batch_id: 'batch-1' });

  it("sends one upsert with onConflict 'id' and ignoreDuplicates true, selecting the return columns", async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: [{ id: 't1', local_date: '2026-09-01', version: 1, rate_pending: false }],
      error: null,
      status: 201,
    });

    const result = await insertTransactionsBatch(client, [chunkRow('t1')]);

    expect(client.calls.find((c) => c.method === 'upsert')?.args).toEqual([
      [{ ...chunkRow('t1') }],
      { onConflict: 'id', ignoreDuplicates: true },
    ]);
    expect(client.calls.find((c) => c.method === 'select')?.args[0]).toBe('id, local_date, version, rate_pending');
    expect(result).toEqual([{ id: 't1', local_date: '2026-09-01', version: 1, rate_pending: false }]);
  });

  it('rejects an empty array with a RangeError, before any network call', async () => {
    const client = createFakeSupabase();
    await expect(insertTransactionsBatch(client, [])).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it(`rejects more than IMPORT_CHUNK_MAX (${IMPORT_CHUNK_MAX}) rows with a RangeError, before any network call`, async () => {
    const client = createFakeSupabase();
    const rows = Array.from({ length: IMPORT_CHUNK_MAX + 1 }, (_, i) => chunkRow(`t${i}`));
    await expect(insertTransactionsBatch(client, rows)).rejects.toBeInstanceOf(RangeError);
    expect(client.calls).toHaveLength(0);
  });

  it('returns only the rows the server actually returned (a replayed chunk returns just the new ones)', async () => {
    const client = createFakeSupabase();
    client.respondWith({
      data: [{ id: 't2', local_date: '2026-09-02', version: 1, rate_pending: false }],
      error: null,
      status: 201,
    });

    const result = await insertTransactionsBatch(client, [chunkRow('t1'), chunkRow('t2')]);

    expect(result).toEqual([{ id: 't2', local_date: '2026-09-02', version: 1, rate_pending: false }]);
  });
});
