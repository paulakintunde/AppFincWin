import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { isResolveRateThrottled, resetResolveRateBackoffForTests } from '@/data/sync/resolveRateBackoff';
import { DbError } from '../errors';
import type { TransactionRow } from '../rows';
import {
  MAX_CODES_PER_ENSURE,
  MAX_IDS_PER_CALL,
  RATE_RESOLUTION_TIMEOUT_MS,
  fetchRatePendingRows,
  requestRateResolution,
  requestRateResolutionBatch,
  requestRatesForDate,
} from '../fxResolve';
import { createFakeSupabase } from './fakeSupabase';

function row(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return { id: 't1', household_id: 'h1', local_date: '2026-09-01', rate_pending: false, ...overrides } as TransactionRow;
}

type Client = ReturnType<typeof createFakeSupabase>;
type Calls = { table?: string; method: string; args: unknown[] }[];
const callsOf = (client: Client): Calls => (client as unknown as { calls: Calls }).calls;
const invokeArgs = (client: Client) => callsOf(client).find((c) => c.method === 'functions.invoke')?.args;

describe('requestRateResolution', () => {
  it("invokes functions 'resolve-rate' with body { transactionId } and returns data.row", async () => {
    const client = createFakeSupabase();
    const resolved = row({ rate_pending: false });
    client.respondWith({ data: { row: resolved }, error: null, status: 200 });

    const result = await requestRateResolution(client, 't1');

    expect(result).toEqual(resolved);
    expect(invokeArgs(client)).toEqual([
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

    it("returns null (never throws) on a 429 from resolve-rate's own throttle", async () => {
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

describe('requestRateResolutionBatch', () => {
  beforeEach(() => resetResolveRateBackoffForTests());
  afterEach(() => resetResolveRateBackoffForTests());

  it('invokes resolve-rate with { transactionIds } and returns data.rows', async () => {
    const client = createFakeSupabase();
    const rows = [row({ id: 'a' }), row({ id: 'b' })];
    client.respondWith({ data: { ok: true, rows }, error: null, status: 200 });
    await expect(requestRateResolutionBatch(client, ['a', 'b'])).resolves.toEqual(rows);
    expect(invokeArgs(client)).toEqual([
      'resolve-rate',
      { body: { transactionIds: ['a', 'b'] }, timeout: RATE_RESOLUTION_TIMEOUT_MS },
    ]);
  });

  it('throws RangeError for 0 or too many ids, before invoking', async () => {
    const client = createFakeSupabase();
    await expect(requestRateResolutionBatch(client, [])).rejects.toBeInstanceOf(RangeError);
    const many = Array.from({ length: MAX_IDS_PER_CALL + 1 }, (_, i) => `t${i}`);
    await expect(requestRateResolutionBatch(client, many)).rejects.toBeInstanceOf(RangeError);
    expect(invokeArgs(client)).toBeUndefined();
  });

  it('returns null on a 502 without noting a throttle', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: new FunctionsHttpError({ status: 502 }), status: 502 });
    await expect(requestRateResolutionBatch(client, ['a'])).resolves.toBeNull();
    expect(isResolveRateThrottled()).toBe(false);
  });

  it('notes the throttle on a 429', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: new FunctionsHttpError({ status: 429 }), status: 429 });
    await expect(requestRateResolutionBatch(client, ['a'])).resolves.toBeNull();
    expect(isResolveRateThrottled()).toBe(true);
  });

  it('rethrows a network error', async () => {
    const client = createFakeSupabase();
    const fetchError = new FunctionsFetchError({ requestId: 'r1' });
    client.respondWith({ data: null, error: fetchError, status: 0 });
    await expect(requestRateResolutionBatch(client, ['a'])).rejects.toBe(fetchError);
  });
});

describe('requestRatesForDate', () => {
  it('dedupes codes and sends { ensure } returning data.stored', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: { ok: true, stored: ['GBP', 'USD'] }, error: null, status: 200 });
    await expect(requestRatesForDate(client, '2026-10-07', ['GBP', 'GBP', 'USD'])).resolves.toEqual(['GBP', 'USD']);
    expect(invokeArgs(client)).toEqual([
      'resolve-rate',
      { body: { ensure: { date: '2026-10-07', currencies: ['GBP', 'USD'] } }, timeout: RATE_RESOLUTION_TIMEOUT_MS },
    ]);
  });

  it('throws RangeError for 0 or more than the max distinct codes', async () => {
    const client = createFakeSupabase();
    await expect(requestRatesForDate(client, '2026-10-07', [])).rejects.toBeInstanceOf(RangeError);
    const many = Array.from({ length: MAX_CODES_PER_ENSURE + 1 }, (_, i) => `C${i}`);
    await expect(requestRatesForDate(client, '2026-10-07', many)).rejects.toBeInstanceOf(RangeError);
    expect(invokeArgs(client)).toBeUndefined();
  });
});

describe('fetchRatePendingRows', () => {
  it('builds the pending query (desc by default, no series filter)', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [row({ rate_pending: true })], error: null, status: 200 });
    const result = await fetchRatePendingRows(client, { onOrBefore: '2026-10-08', limit: 100 });
    expect(result).toHaveLength(1);
    const calls = callsOf(client);
    expect(calls.every((c) => c.table === 'transactions')).toBe(true);
    expect(calls.find((c) => c.method === 'select')?.args).toEqual(['id, household_id, local_date, rate_pending']);
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['rate_pending', true]);
    expect(calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null]);
    expect(calls.find((c) => c.method === 'lte')?.args).toEqual(['local_date', '2026-10-08']);
    expect(calls.find((c) => c.method === 'order')?.args).toEqual(['local_date', { ascending: false }]);
    expect(calls.find((c) => c.method === 'limit')?.args).toEqual([100]);
    expect(calls.filter((c) => c.method === 'eq')).toHaveLength(1);
  });

  it('supports asc order and a recurring_series_id filter', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: [], error: null, status: 200 });
    await fetchRatePendingRows(client, { onOrBefore: '2026-10-08', limit: 5, order: 'asc', recurringSeriesId: 's1' });
    const calls = callsOf(client);
    expect(calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['rate_pending', true],
      ['recurring_series_id', 's1'],
    ]);
    expect(calls.find((c) => c.method === 'order')?.args).toEqual(['local_date', { ascending: true }]);
  });

  it('maps a query error through toDbError', async () => {
    const client = createFakeSupabase();
    client.respondWith({ data: null, error: { message: 'boom', code: 'XX000' }, status: 500 });
    await expect(fetchRatePendingRows(client, { onOrBefore: '2026-10-08', limit: 1 })).rejects.toBeInstanceOf(DbError);
  });
});
