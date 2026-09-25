import { resolveRate, type ResolveDeps, type PendingTransaction } from './resolve';
import { FRANKFURTER_V2_RATES_URL, type FxRow } from '../fx-sync/parse';

const VALID_ID = '11111111-1111-1111-1111-111111111111';

function makeDeps(overrides: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    readPending: jest.fn(async () => null),
    customReference: jest.fn(async () => null),
    fetchJson: jest.fn(async () => []),
    upsertRates: jest.fn(async () => undefined),
    blockedHolds: jest.fn(async () => []),
    storedRatesAround: jest.fn(async () => []),
    upsertHolds: jest.fn(async () => undefined),
    insertAlerts: jest.fn(async () => undefined),
    restamp: jest.fn(async () => ({ id: VALID_ID, rate_pending: false })),
    ...overrides,
  };
}

function pendingRow(overrides: Partial<PendingTransaction> = {}): PendingTransaction {
  return {
    id: VALID_ID,
    original_currency: 'JPY',
    home_currency: 'USD',
    local_date: '2020-01-15',
    rate_pending: true,
    created_by: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    ...overrides,
  };
}

describe('resolveRate', () => {
  it('rejects a non-object input with 400 invalid-input', async () => {
    const deps = makeDeps();
    const result = await resolveRate(deps, null);
    expect(result).toEqual({ status: 400, body: { ok: false, error: 'invalid-input' } });
    expect(deps.readPending).not.toHaveBeenCalled();
  });

  it('rejects a missing or non-UUID transactionId with 400 invalid-input', async () => {
    const deps = makeDeps();
    expect(await resolveRate(deps, {})).toEqual({ status: 400, body: { ok: false, error: 'invalid-input' } });
    expect(await resolveRate(deps, { transactionId: 'not-a-uuid' })).toEqual({
      status: 400,
      body: { ok: false, error: 'invalid-input' },
    });
    expect(await resolveRate(deps, { transactionId: 123 })).toEqual({
      status: 400,
      body: { ok: false, error: 'invalid-input' },
    });
  });

  it('returns 404 and performs no fetch or admin write when readPending finds nothing', async () => {
    const deps = makeDeps({ readPending: jest.fn(async () => null) });
    const result = await resolveRate(deps, { transactionId: VALID_ID });
    expect(result).toEqual({ status: 404, body: { ok: false, error: 'not-found' } });
    expect(deps.fetchJson).not.toHaveBeenCalled();
    expect(deps.upsertRates).not.toHaveBeenCalled();
    expect(deps.restamp).not.toHaveBeenCalled();
  });

  it('returns the row as-is, with no fetch, when the row is not pending', async () => {
    const row = pendingRow({ rate_pending: false });
    const deps = makeDeps({ readPending: jest.fn(async () => row) });
    const result = await resolveRate(deps, { transactionId: VALID_ID });
    expect(result).toEqual({ status: 200, body: { ok: true, pending: false, row } });
    expect(deps.fetchJson).not.toHaveBeenCalled();
    expect(deps.restamp).not.toHaveBeenCalled();
  });

  it('fetches the sorted, EUR-excluded quotes for a pending JPY->USD row and restamps', async () => {
    // The raw Frankfurter v2 response shape (numeric rate) -- parseFrankfurterRates
    // converts this into FxRow[] (string rate) internally.
    const frankfurterJson = [
      { base: 'EUR', quote: 'JPY', rate: 163.5, date: '2020-01-15' },
      { base: 'EUR', quote: 'USD', rate: 1.11, date: '2020-01-15' },
    ];
    const expectedRows: FxRow[] = [
      { base: 'EUR', quote: 'JPY', rate: '163.5', date: '2020-01-15' },
      { base: 'EUR', quote: 'USD', rate: '1.11', date: '2020-01-15' },
    ];
    const restamped = { id: VALID_ID, rate_pending: false, rate: '0.006' };
    const fetchJson = jest.fn(async () => frankfurterJson);
    const upsertRates = jest.fn(async () => undefined);
    const restamp = jest.fn(async () => restamped);
    const deps = makeDeps({
      readPending: jest.fn(async () => pendingRow()),
      fetchJson,
      upsertRates,
      restamp,
    });

    const result = await resolveRate(deps, { transactionId: VALID_ID });

    expect(fetchJson).toHaveBeenCalledWith(`${FRANKFURTER_V2_RATES_URL}?date=2020-01-15&base=EUR&quotes=JPY,USD`);
    expect(upsertRates).toHaveBeenCalledWith(expectedRows);
    expect(restamp).toHaveBeenCalledWith(VALID_ID);
    expect(result).toEqual({ status: 200, body: { ok: true, pending: false, row: restamped } });
  });

  it('uses the custom currency\'s reference currency instead of its own code', async () => {
    const customReference = jest.fn(async (_ownerId: string | null, code: string) => (code === 'GLD' ? 'USD' : null));
    const fetchJson = jest.fn(async () => [] as FxRow[]);
    const deps = makeDeps({
      readPending: jest.fn(async () => pendingRow({ original_currency: 'GLD', home_currency: 'EUR' })),
      customReference,
      fetchJson,
    });

    await resolveRate(deps, { transactionId: VALID_ID });

    expect(customReference).toHaveBeenCalledWith('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GLD');
    expect(fetchJson).toHaveBeenCalledWith(`${FRANKFURTER_V2_RATES_URL}?date=2020-01-15&base=EUR&quotes=USD`);
  });

  it('skips the fetch entirely when both currencies resolve to EUR', async () => {
    const customReference = jest.fn(async (_ownerId: string | null, code: string) => (code === 'PTS' ? 'EUR' : null));
    const fetchJson = jest.fn(async () => [] as FxRow[]);
    const restamp = jest.fn(async () => ({ id: VALID_ID, rate_pending: false }));
    const deps = makeDeps({
      readPending: jest.fn(async () => pendingRow({ original_currency: 'EUR', home_currency: 'PTS' })),
      customReference,
      fetchJson,
      restamp,
    });

    const result = await resolveRate(deps, { transactionId: VALID_ID });

    expect(fetchJson).not.toHaveBeenCalled();
    expect(restamp).toHaveBeenCalledWith(VALID_ID);
    expect(result).toEqual({ status: 200, body: { ok: true, pending: false, row: { id: VALID_ID, rate_pending: false } } });
  });

  it('returns 502 upstream and never restamps when the Frankfurter fetch fails', async () => {
    const fetchJson = jest.fn(async () => {
      throw new Error('network down');
    });
    const restamp = jest.fn(async () => ({ id: VALID_ID, rate_pending: true }));
    const deps = makeDeps({ readPending: jest.fn(async () => pendingRow()), fetchJson, restamp });

    const result = await resolveRate(deps, { transactionId: VALID_ID });

    expect(result).toEqual({ status: 502, body: { ok: false, error: 'upstream' } });
    expect(restamp).not.toHaveBeenCalled();
  });

  it('returns 502 upstream and never restamps when the Frankfurter response fails to parse', async () => {
    const fetchJson = jest.fn(async () => ({ rates: {} })); // v1 shape, rejected by parseFrankfurterRates
    const restamp = jest.fn(async () => ({ id: VALID_ID, rate_pending: true }));
    const deps = makeDeps({ readPending: jest.fn(async () => pendingRow()), fetchJson, restamp });

    const result = await resolveRate(deps, { transactionId: VALID_ID });

    expect(result).toEqual({ status: 502, body: { ok: false, error: 'upstream' } });
    expect(restamp).not.toHaveBeenCalled();
  });

  describe('backfill quarantine (CR-B01: resolve-rate goes through the same plausibility/hold path as fx-sync)', () => {
    it('drops rows for a quote that was not requested, or dated after the transaction local_date', async () => {
      const fetchJson = jest.fn(async () => [
        { base: 'EUR', quote: 'JPY', rate: 163.5, date: '2020-01-15' },
        { base: 'EUR', quote: 'USD', rate: 1.11, date: '2020-01-16' }, // after local_date
        { base: 'EUR', quote: 'GBP', rate: 0.85, date: '2020-01-15' }, // never requested
      ]);
      const upsertRates = jest.fn(async () => undefined);
      const deps = makeDeps({ readPending: jest.fn(async () => pendingRow()), fetchJson, upsertRates });

      await resolveRate(deps, { transactionId: VALID_ID });

      expect(upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'JPY', rate: '163.5', date: '2020-01-15' }]);
    });

    it('never serves a row whose (quote, date) has an open or dropped hold', async () => {
      const fetchJson = jest.fn(async () => [
        { base: 'EUR', quote: 'JPY', rate: 163.5, date: '2020-01-15' },
        { base: 'EUR', quote: 'USD', rate: 1.11, date: '2020-01-15' },
      ]);
      const blockedHolds = jest.fn(async () => [{ quote: 'USD', heldDate: '2020-01-15' }]);
      const upsertRates = jest.fn(async () => undefined);
      const deps = makeDeps({ readPending: jest.fn(async () => pendingRow()), fetchJson, blockedHolds, upsertRates });

      await resolveRate(deps, { transactionId: VALID_ID });

      expect(blockedHolds).toHaveBeenCalledWith(['JPY', 'USD']);
      expect(upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'JPY', rate: '163.5', date: '2020-01-15' }]);
    });

    it('quarantines a >10% move against the nearest stored prior into fx_rate_holds, not fx_rates, and alerts', async () => {
      const fetchJson = jest.fn(async () => [
        { base: 'EUR', quote: 'JPY', rate: 163.5, date: '2020-01-15' },
        { base: 'EUR', quote: 'USD', rate: 1.5, date: '2020-01-15' },
      ]);
      const storedRatesAround = jest.fn(async (quote: string) =>
        quote === 'USD' ? [{ quote: 'USD', rate: '1.1', date: '2019-12-01' }] : []
      );
      const upsertRates = jest.fn(async () => undefined);
      const upsertHolds = jest.fn(async () => undefined);
      const insertAlerts = jest.fn(async () => undefined);
      const deps = makeDeps({
        readPending: jest.fn(async () => pendingRow()),
        fetchJson,
        storedRatesAround,
        upsertRates,
        upsertHolds,
        insertAlerts,
      });

      await resolveRate(deps, { transactionId: VALID_ID });

      expect(storedRatesAround).toHaveBeenCalledWith('USD', '2020-01-15');
      expect(upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'JPY', rate: '163.5', date: '2020-01-15' }]);
      expect(upsertHolds).toHaveBeenCalledWith([
        expect.objectContaining({ quote: 'USD', rate: '1.5', date: '2020-01-15', priorRate: '1.1', source: 'frankfurter-v2' }),
      ]);
      expect(insertAlerts).toHaveBeenCalledWith([
        expect.objectContaining({ kind: 'held', quote: 'USD', detail: expect.objectContaining({ via: 'resolve-rate' }) }),
      ]);
    });

    it('writes nothing to fx_rates when every returned row is filtered or held', async () => {
      const fetchJson = jest.fn(async () => [{ base: 'EUR', quote: 'USD', rate: 1.11, date: '2020-01-15' }]);
      const blockedHolds = jest.fn(async () => [{ quote: 'USD', heldDate: '2020-01-15' }]);
      const upsertRates = jest.fn(async () => undefined);
      const upsertHolds = jest.fn(async () => undefined);
      const deps = makeDeps({
        readPending: jest.fn(async () => pendingRow({ original_currency: 'USD', home_currency: 'EUR' })),
        fetchJson,
        blockedHolds,
        upsertRates,
        upsertHolds,
      });

      await resolveRate(deps, { transactionId: VALID_ID });

      expect(upsertRates).not.toHaveBeenCalled();
      expect(upsertHolds).not.toHaveBeenCalled();
    });
  });
});
