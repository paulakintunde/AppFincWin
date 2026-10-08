import { resolveRate, type ResolveDeps, type PendingTransaction } from './resolve';
import { FRANKFURTER_V2_RATES_URL, type FxRow } from '../_shared/fx/parse';

const VALID_ID = '11111111-1111-1111-1111-111111111111';

function makeDeps(overrides: Partial<ResolveDeps> = {}): ResolveDeps {
  return {
    checkRateLimit: jest.fn(async () => true),
    readPending: jest.fn(async () => null),
    customReference: jest.fn(async () => null),
    fetchJson: jest.fn(async () => []),
    today: jest.fn(() => '2026-10-07'),
    callerId: jest.fn(async () => 'u1'),
    readPendingMany: jest.fn(async () => []),
    quotesNeedingFetch: jest.fn(async (quotes: string[]) => quotes),
    openHolds: jest.fn(async () => []),
    confirmHolds: jest.fn(async () => undefined),
    upsertRates: jest.fn(async () => undefined),
    upsertLookups: jest.fn(async () => undefined),
    recordFailures: jest.fn(async () => undefined),
    clearFailures: jest.fn(async () => undefined),
    autoAcceptHolds: jest.fn(async () => []),
    refreshLookupsFor: jest.fn(async () => undefined),
    recentFailureAlert: jest.fn(async () => false),
    notify: jest.fn(async () => undefined),
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

  it('RD-05: returns 429 rate-limited and performs no read/fetch/write when the caller is over the throttle', async () => {
    const checkRateLimit = jest.fn(async () => false);
    const readPending = jest.fn(async () => pendingRow());
    const deps = makeDeps({ checkRateLimit, readPending });

    const result = await resolveRate(deps, { transactionId: VALID_ID });

    expect(result).toEqual({ status: 429, body: { ok: false, error: 'rate-limited' } });
    expect(readPending).not.toHaveBeenCalled();
    expect(deps.fetchJson).not.toHaveBeenCalled();
    expect(deps.restamp).not.toHaveBeenCalled();
  });

  it('RD-05: an invalid-input request is rejected before the rate limit is even checked', async () => {
    const checkRateLimit = jest.fn(async () => true);
    const deps = makeDeps({ checkRateLimit });
    await resolveRate(deps, { transactionId: 'not-a-uuid' });
    expect(checkRateLimit).not.toHaveBeenCalled();
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
    expect(upsertRates).toHaveBeenCalledWith(expectedRows, 'frankfurter-v2');
    expect(restamp).toHaveBeenCalledWith(VALID_ID, ['JPY', 'USD']);
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
    expect(restamp).toHaveBeenCalledWith(VALID_ID, []);
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

      expect(upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'JPY', rate: '163.5', date: '2020-01-15' }], 'frankfurter-v2');
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
      expect(upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'JPY', rate: '163.5', date: '2020-01-15' }], 'frankfurter-v2');
    });

    it('quarantines a >10% move against the nearest stored prior into fx_rate_holds, not fx_rates, and alerts', async () => {
      const fetchJson = jest.fn(async () => [
        { base: 'EUR', quote: 'JPY', rate: 163.5, date: '2020-01-15' },
        { base: 'EUR', quote: 'USD', rate: 1.5, date: '2020-01-15' },
      ]);
      const storedRatesAround = jest.fn(async (quote: string) =>
        quote === 'USD' ? [{ quote: 'USD', rate: '1.1', date: '2020-01-10' }] : []
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
      expect(upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'JPY', rate: '163.5', date: '2020-01-15' }], 'frankfurter-v2');
      expect(upsertHolds).toHaveBeenCalledWith([
        expect.objectContaining({ quote: 'USD', rate: '1.5', date: '2020-01-15', priorRate: '1.1', source: 'frankfurter-v2' }),
      ]);
      expect(insertAlerts).toHaveBeenCalledWith([
        expect.objectContaining({ kind: 'held', quote: 'USD', detail: expect.objectContaining({ via: 'resolve-rate' }) }),
      ]);
    });

    it('accepts the same 50% move when the only prior is 45 days old (outside PRIOR_WINDOW_DAYS)', async () => {
      const fetchJson = jest.fn(async () => [{ base: 'EUR', quote: 'USD', rate: 1.5, date: '2020-01-15' }]);
      const storedRatesAround = jest.fn(async () => [{ quote: 'USD', rate: '1.1', date: '2019-12-01' }]);
      const upsertRates = jest.fn(async () => undefined);
      const upsertHolds = jest.fn(async () => undefined);
      const deps = makeDeps({
        readPending: jest.fn(async () => pendingRow({ original_currency: 'USD', home_currency: 'EUR' })),
        fetchJson,
        storedRatesAround,
        upsertRates,
        upsertHolds,
      });

      await resolveRate(deps, { transactionId: VALID_ID });

      expect(upsertHolds).not.toHaveBeenCalled();
      expect(upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'USD', rate: '1.5', date: '2020-01-15' }], 'frankfurter-v2');
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

  describe('restamp window (WR-B01: only backfilled quotes may use a rate older than 7 days)', () => {
    it('relaxes only the quotes whose backfilled row was actually stored, never a held or missing one', async () => {
      const fetchJson = jest.fn(async () => [
        { base: 'EUR', quote: 'JPY', rate: 163.5, date: '2020-01-15' },
        { base: 'EUR', quote: 'USD', rate: 1.5, date: '2020-01-15' }, // held: >10% from the stored prior
      ]);
      const storedRatesAround = jest.fn(async (quote: string) =>
        quote === 'USD' ? [{ quote: 'USD', rate: '1.1', date: '2020-01-10' }] : []
      );
      const restamp = jest.fn(async () => ({ id: VALID_ID, rate_pending: true }));
      const deps = makeDeps({ readPending: jest.fn(async () => pendingRow()), fetchJson, storedRatesAround, restamp });

      const result = await resolveRate(deps, { transactionId: VALID_ID });

      expect(restamp).toHaveBeenCalledWith(VALID_ID, ['JPY']);
      expect(result).toMatchObject({ status: 200, body: { ok: true, pending: true } });
    });

    it('relaxes nothing for a leg Frankfurter did not return at all', async () => {
      const fetchJson = jest.fn(async () => [{ base: 'EUR', quote: 'USD', rate: 1.11, date: '2020-01-15' }]);
      const restamp = jest.fn(async () => ({ id: VALID_ID, rate_pending: true }));
      const deps = makeDeps({ readPending: jest.fn(async () => pendingRow()), fetchJson, restamp });

      await resolveRate(deps, { transactionId: VALID_ID });

      expect(restamp).toHaveBeenCalledWith(VALID_ID, ['USD']);
    });
  });

  describe('internal errors (IN-B01: always the {ok:false} shape the client classifier expects)', () => {
    it('returns 500 internal when the user-scoped read throws', async () => {
      const deps = makeDeps({
        readPending: jest.fn(async () => {
          throw new Error('JWT expired');
        }),
      });
      expect(await resolveRate(deps, { transactionId: VALID_ID })).toEqual({
        status: 500,
        body: { ok: false, error: 'internal' },
      });
    });

    it('returns 500 internal when an admin write throws', async () => {
      const fetchJson = jest.fn(async () => [{ base: 'EUR', quote: 'JPY', rate: 163.5, date: '2020-01-15' }]);
      const deps = makeDeps({
        readPending: jest.fn(async () => pendingRow()),
        fetchJson,
        upsertRates: jest.fn(async () => {
          throw new Error('db down');
        }),
      });
      expect(await resolveRate(deps, { transactionId: VALID_ID })).toEqual({
        status: 500,
        body: { ok: false, error: 'internal' },
      });
    });

    it('returns 500 internal when the restamp throws', async () => {
      const deps = makeDeps({
        readPending: jest.fn(async () => pendingRow({ original_currency: 'EUR', home_currency: 'EUR' })),
        restamp: jest.fn(async () => {
          throw new Error('rpc failed');
        }),
      });
      expect(await resolveRate(deps, { transactionId: VALID_ID })).toEqual({
        status: 500,
        body: { ok: false, error: 'internal' },
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 02-44: on-demand FX -- shapes A/B/C, per-date fetch planning, fallback,
// coverage and failure records.
// ---------------------------------------------------------------------------
const ID2 = '22222222-2222-2222-2222-222222222222';
const ID3 = '33333333-3333-3333-3333-333333333333';
const OPEN_ER = 'https://open.er-api.com/v6/latest/EUR';
const frank = (date: string, rates: Record<string, number>) =>
  Object.entries(rates).map(([quote, rate]) => ({ base: 'EUR', quote, rate, date }));
const openEr = (updated: string, rates: Record<string, number>) => ({
  result: 'success',
  base_code: 'EUR',
  time_last_update_utc: updated,
  rates: { EUR: 1, ...rates },
});
const frankUrl = (date: string, quotes: string) => `${FRANKFURTER_V2_RATES_URL}?date=${date}&base=EUR&quotes=${quotes}`;
const ERR_FETCH = async (): Promise<unknown> => {
  throw new Error('down');
};

describe('02-44 shape B and C validation', () => {
  it('B: rejects empty, >50, non-uuid and duplicate ids', async () => {
    const deps = makeDeps();
    const many = Array.from({ length: 51 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    const bad = [[], many, ['x'], [VALID_ID, VALID_ID]];
    for (const transactionIds of bad) {
      expect(await resolveRate(deps, { transactionIds })).toEqual({ status: 400, body: { ok: false, error: 'invalid-input' } });
    }
    expect(deps.checkRateLimit).not.toHaveBeenCalled();
  });

  it('C: rejects bad date format, out-of-range dates, bad currency lists and lowercase codes', async () => {
    const deps = makeDeps();
    const cases: unknown[] = [
      { date: '2026/10/01', currencies: ['GBP'] },
      { date: '1998-12-31', currencies: ['GBP'] },
      { date: '2026-10-09', currencies: ['GBP'] }, // today (10-07) + 2
      { date: '2026-02-31', currencies: ['GBP'] },
      { date: '2026-10-01', currencies: [] },
      { date: '2026-10-01', currencies: Array.from({ length: 51 }, () => 'GBP') },
      { date: '2026-10-01', currencies: ['gbp'] },
    ];
    for (const ensure of cases) {
      expect(await resolveRate(deps, { ensure })).toEqual({ status: 400, body: { ok: false, error: 'invalid-input' } });
    }
    expect(await resolveRate(deps, {})).toEqual({ status: 400, body: { ok: false, error: 'invalid-input' } });
  });

  it('B and C: rate limit runs first; over the limit answers 429 with nothing else called', async () => {
    const deps = makeDeps({ checkRateLimit: jest.fn(async () => false) });
    expect(await resolveRate(deps, { transactionIds: [VALID_ID] })).toEqual({ status: 429, body: { ok: false, error: 'rate-limited' } });
    expect(await resolveRate(deps, { ensure: { date: '2026-10-01', currencies: ['GBP'] } })).toEqual({
      status: 429,
      body: { ok: false, error: 'rate-limited' },
    });
    expect(deps.readPendingMany).not.toHaveBeenCalled();
    expect(deps.quotesNeedingFetch).not.toHaveBeenCalled();
    expect(deps.fetchJson).not.toHaveBeenCalled();
  });

  it('B: 404 when no id is visible', async () => {
    const deps = makeDeps({ readPendingMany: jest.fn(async () => []) });
    expect(await resolveRate(deps, { transactionIds: [VALID_ID] })).toEqual({ status: 404, body: { ok: false, error: 'not-found' } });
  });
});

describe('02-44 shape B: one primary request per distinct date', () => {
  it('3 ids over 2 dates -> exactly 2 primary fetches, one restamp per pending id, rows in input order', async () => {
    const rows = [
      pendingRow({ id: VALID_ID, original_currency: 'GBP', local_date: '2026-09-01' }),
      pendingRow({ id: ID2, original_currency: 'JPY', local_date: '2026-09-01' }),
      pendingRow({ id: ID3, original_currency: 'GBP', local_date: '2026-09-02' }),
    ];
    const fetchJson = jest.fn(async (url: string) =>
      url.includes('date=2026-09-01') ? frank('2026-09-01', { GBP: 0.85, JPY: 160, USD: 1.1 }) : frank('2026-09-02', { GBP: 0.85, USD: 1.1 })
    );
    const restamp = jest.fn(async (id: string) => ({ id, rate_pending: false }));
    const deps = makeDeps({ readPendingMany: jest.fn(async () => [rows[2], rows[0], rows[1]]), fetchJson, restamp });

    const result = await resolveRate(deps, { transactionIds: [VALID_ID, ID2, ID3] });

    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(fetchJson).toHaveBeenCalledWith(frankUrl('2026-09-01', 'GBP,JPY,USD'));
    expect(fetchJson).toHaveBeenCalledWith(frankUrl('2026-09-02', 'GBP,USD'));
    expect(restamp).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        rows: [
          { id: VALID_ID, rate_pending: false },
          { id: ID2, rate_pending: false },
          { id: ID3, rate_pending: false },
        ],
      },
    });
  });

  it('no fetch when quotesNeedingFetch reports nothing; rows still restamped with relax [] and no auto-accept', async () => {
    const restamp = jest.fn(async () => ({ id: VALID_ID, rate_pending: false }));
    const deps = makeDeps({
      readPendingMany: jest.fn(async () => [pendingRow()]),
      quotesNeedingFetch: jest.fn(async () => []),
      restamp,
    });
    const result = await resolveRate(deps, { transactionIds: [VALID_ID] });
    expect(deps.fetchJson).not.toHaveBeenCalled();
    expect(deps.autoAcceptHolds).not.toHaveBeenCalled();
    expect(restamp).toHaveBeenCalledWith(VALID_ID, []);
    expect(result.status).toBe(200);
  });

  it('a row dated more than today+1 never triggers a fetch and is restamped as-is', async () => {
    const restamp = jest.fn(async () => ({ id: VALID_ID, rate_pending: true }));
    const deps = makeDeps({ readPendingMany: jest.fn(async () => [pendingRow({ local_date: '2026-10-10' })]), restamp });
    await resolveRate(deps, { transactionIds: [VALID_ID] });
    expect(deps.quotesNeedingFetch).not.toHaveBeenCalled();
    expect(deps.fetchJson).not.toHaveBeenCalled();
    expect(restamp).toHaveBeenCalledWith(VALID_ID, []);
  });

  it('asks only for the quotes quotesNeedingFetch narrows to', async () => {
    const fetchJson = jest.fn(async () => frank('2020-01-15', { JPY: 163.5 }));
    const deps = makeDeps({
      readPending: jest.fn(async () => pendingRow()),
      quotesNeedingFetch: jest.fn(async () => ['JPY']),
      fetchJson,
    });
    await resolveRate(deps, { transactionId: VALID_ID });
    expect(fetchJson).toHaveBeenCalledWith(frankUrl('2020-01-15', 'JPY'));
  });

  it('B: a date whose fetch failed on both sources is not restamped; other dates are; all failed -> 502', async () => {
    const rows = [
      pendingRow({ id: VALID_ID, local_date: '2026-09-01' }),
      pendingRow({ id: ID2, local_date: '2026-09-02' }),
    ];
    const restamp = jest.fn(async (id: string) => ({ id, rate_pending: false }));
    const fetchJson = jest.fn(async (url: string) => {
      if (url.includes('open.er-api') || url.includes('date=2026-09-01')) throw new Error('down');
      return frank('2026-09-02', { JPY: 160, USD: 1.1 });
    });
    const deps = makeDeps({ readPendingMany: jest.fn(async () => rows), fetchJson, restamp });
    const result = await resolveRate(deps, { transactionIds: [VALID_ID, ID2] });
    expect(restamp).toHaveBeenCalledTimes(1);
    expect(restamp).toHaveBeenCalledWith(ID2, ['JPY', 'USD']);
    expect(result).toEqual({
      status: 200,
      body: { ok: true, rows: [rows[0], { id: ID2, rate_pending: false }] },
    });
    expect(deps.recordFailures).toHaveBeenCalledWith('2026-09-01', ['JPY', 'USD'], 'both-sources-failed');

    const allFail = makeDeps({
      readPendingMany: jest.fn(async () => rows),
      fetchJson: jest.fn(ERR_FETCH),
      restamp: jest.fn(async () => ({})),
    });
    expect(await resolveRate(allFail, { transactionIds: [VALID_ID, ID2] })).toEqual({
      status: 502,
      body: { ok: false, error: 'upstream' },
    });
    expect(allFail.restamp).not.toHaveBeenCalled();
  });
});

describe('02-44 shape C', () => {
  it('fetches the requested quote only and answers stored', async () => {
    const customReference = jest.fn(async () => null);
    const fetchJson = jest.fn(async () => frank('2026-10-01', { GBP: 0.85 }));
    const deps = makeDeps({ customReference, fetchJson });
    const result = await resolveRate(deps, { ensure: { date: '2026-10-01', currencies: ['GBP'] } });
    expect(customReference).toHaveBeenCalledWith('u1', 'GBP');
    expect(fetchJson).toHaveBeenCalledWith(frankUrl('2026-10-01', 'GBP'));
    expect(result).toEqual({ status: 200, body: { ok: true, stored: ['GBP'] } });
  });

  it('a custom code referencing EUR, or EUR alone, needs no fetch', async () => {
    const deps = makeDeps({ customReference: jest.fn(async (_o: string | null, c: string) => (c === 'PTS' ? 'EUR' : null)) });
    expect(await resolveRate(deps, { ensure: { date: '2026-10-01', currencies: ['PTS'] } })).toEqual({
      status: 200,
      body: { ok: true, stored: [] },
    });
    expect(await resolveRate(deps, { ensure: { date: '2026-10-01', currencies: ['EUR'] } })).toEqual({
      status: 200,
      body: { ok: true, stored: [] },
    });
    expect(deps.fetchJson).not.toHaveBeenCalled();
  });

  it('answers 502 when the needed fetch stored nothing usable', async () => {
    const deps = makeDeps({ fetchJson: jest.fn(async () => frank('2026-10-01', { USD: 1.1 })) });
    expect(await resolveRate(deps, { ensure: { date: '2026-10-01', currencies: ['GBP'] } })).toEqual({
      status: 502,
      body: { ok: false, error: 'upstream' },
    });
  });
});

describe('02-44 fallback, coverage and failures', () => {
  const run = (overrides: Partial<ResolveDeps>) =>
    makeDeps({ readPending: jest.fn(async () => pendingRow({ original_currency: 'GBP', home_currency: 'EUR' })), ...overrides });

  it('Frankfurter throws -> open.er-api stores rows dated <= the requested date, lookups use that source, failures cleared', async () => {
    const fetchJson = jest.fn(async (url: string) => {
      if (url.startsWith(FRANKFURTER_V2_RATES_URL)) throw new Error('down');
      return openEr('Wed, 07 Oct 2026 00:02:31 +0000', { GBP: 0.86, USD: 1.1 });
    });
    const deps = run({
      readPending: jest.fn(async () => pendingRow({ original_currency: 'GBP', home_currency: 'EUR', local_date: '2026-10-07' })),
      fetchJson,
    });
    const result = await resolveRate(deps, { transactionId: VALID_ID });
    expect(fetchJson).toHaveBeenCalledWith(OPEN_ER);
    expect(deps.upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'GBP', rate: '0.86', date: '2026-10-07' }], 'open-er-api');
    expect(deps.upsertLookups).toHaveBeenCalledWith([
      { quote: 'GBP', requestedDate: '2026-10-07', rateDate: '2026-10-07', source: 'open-er-api' },
    ]);
    expect(deps.clearFailures).toHaveBeenCalledWith('2026-10-07', ['GBP']);
    expect(result.status).toBe(200);
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('open.er-api row dated after the requested date -> nothing stored, no-usable-rate failure + alert + notify; A restamps; C 502', async () => {
    const fetchJson = jest.fn(async (url: string) => {
      if (url.startsWith(FRANKFURTER_V2_RATES_URL)) throw new Error('down');
      return openEr('Wed, 07 Oct 2026 00:02:31 +0000', { GBP: 0.86 });
    });
    const restamp = jest.fn(async () => ({ id: VALID_ID, rate_pending: true }));
    const deps = run({ fetchJson, restamp });
    const result = await resolveRate(deps, { transactionId: VALID_ID });
    expect(deps.upsertRates).not.toHaveBeenCalled();
    expect(deps.recordFailures).toHaveBeenCalledWith('2020-01-15', ['GBP'], 'no-usable-rate');
    expect(deps.insertAlerts).toHaveBeenCalledWith([
      { kind: 'sync-failed', detail: { via: 'resolve-rate', date: '2020-01-15', quotes: ['GBP'], reason: 'no-usable-rate' } },
    ]);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(restamp).toHaveBeenCalledWith(VALID_ID, []);
    expect(result.status).toBe(200);
    const c = await resolveRate(deps, { ensure: { date: '2020-01-15', currencies: ['GBP'] } });
    expect(c.status).toBe(502);
  });

  it('both sources throw -> both-sources-failed, one alert, one notify, A answers 502', async () => {
    const deps = run({ fetchJson: jest.fn(ERR_FETCH) });
    const result = await resolveRate(deps, { transactionId: VALID_ID });
    expect(result.status).toBe(502);
    expect(deps.recordFailures).toHaveBeenCalledWith('2020-01-15', ['GBP'], 'both-sources-failed');
    expect(deps.insertAlerts).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.restamp).not.toHaveBeenCalled();
  });

  it('a requested quote missing from a good response -> others stored, failure + alert for the missing quote only', async () => {
    const deps = makeDeps({
      readPending: jest.fn(async () => pendingRow()),
      fetchJson: jest.fn(async () => frank('2020-01-15', { USD: 1.11 })),
    });
    await resolveRate(deps, { transactionId: VALID_ID });
    expect(deps.upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'USD', rate: '1.11', date: '2020-01-15' }], 'frankfurter-v2');
    expect(deps.recordFailures).toHaveBeenCalledWith('2020-01-15', ['JPY'], 'no-usable-rate');
    expect(deps.clearFailures).toHaveBeenCalledWith('2020-01-15', ['USD']);
    expect(deps.insertAlerts).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'sync-failed', detail: expect.objectContaining({ quotes: ['JPY'] }) }),
    ]);
  });

  it('recentFailureAlert true -> no duplicate alert, notify still called', async () => {
    const deps = run({ fetchJson: jest.fn(ERR_FETCH), recentFailureAlert: jest.fn(async () => true) });
    await resolveRate(deps, { transactionId: VALID_ID });
    expect(deps.insertAlerts).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });

  it('records a lookup for every accepted row (requested date, row date, source)', async () => {
    const deps = makeDeps({
      readPending: jest.fn(async () => pendingRow({ local_date: '2020-01-18' })),
      fetchJson: jest.fn(async () => [...frank('2020-01-17', { JPY: 163.5 }), ...frank('2020-01-18', { USD: 1.11 })]),
    });
    await resolveRate(deps, { transactionId: VALID_ID });
    expect(deps.upsertLookups).toHaveBeenCalledWith([
      { quote: 'JPY', requestedDate: '2020-01-18', rateDate: '2020-01-17', source: 'frankfurter-v2' },
      { quote: 'USD', requestedDate: '2020-01-18', rateDate: '2020-01-18', source: 'frankfurter-v2' },
    ]);
  });

  it('auto-accept runs once per call before the first fetch; accepted holds refresh lookups and notify', async () => {
    const order: string[] = [];
    const accepted = [{ quote: 'GBP', heldDate: '2026-10-05' }];
    const deps = makeDeps({
      readPendingMany: jest.fn(async () => [pendingRow({ local_date: '2026-09-01' }), pendingRow({ id: ID2, local_date: '2026-09-02' })]),
      autoAcceptHolds: jest.fn(async () => {
        order.push('auto');
        return accepted;
      }),
      fetchJson: jest.fn(async (url: string) => {
        order.push('fetch');
        return frank(url.includes('09-01') ? '2026-09-01' : '2026-09-02', { JPY: 160, USD: 1.1 });
      }),
    });
    await resolveRate(deps, { transactionIds: [VALID_ID, ID2] });
    expect(deps.autoAcceptHolds).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe('auto');
    expect(deps.refreshLookupsFor).toHaveBeenCalledWith(accepted);
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });

  it('auto-accept returning nothing -> no refresh, no notify', async () => {
    const deps = makeDeps({
      readPending: jest.fn(async () => pendingRow()),
      fetchJson: jest.fn(async () => frank('2020-01-15', { JPY: 160, USD: 1.1 })),
    });
    await resolveRate(deps, { transactionId: VALID_ID });
    expect(deps.autoAcceptHolds).toHaveBeenCalledTimes(1);
    expect(deps.refreshLookupsFor).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('a held value is recorded as a failure with reason held (no extra sync-failed alert)', async () => {
    const deps = makeDeps({
      readPending: jest.fn(async () => pendingRow({ original_currency: 'USD', home_currency: 'EUR' })),
      fetchJson: jest.fn(async () => frank('2020-01-15', { USD: 1.5 })),
      storedRatesAround: jest.fn(async () => [{ quote: 'USD', rate: '1.1', date: '2020-01-10' }]),
    });
    await resolveRate(deps, { transactionId: VALID_ID });
    expect(deps.recordFailures).toHaveBeenCalledWith('2020-01-15', ['USD'], 'held');
    expect(deps.upsertLookups).toHaveBeenCalledWith([
      { quote: 'USD', requestedDate: '2020-01-15', rateDate: '2020-01-15', source: 'frankfurter-v2' },
    ]);
    expect(deps.insertAlerts).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 02-44 Task 2: MON-11 second-source confirmation.
// ---------------------------------------------------------------------------
describe('02-44 MON-11 holds: open holds and the second-source witness', () => {
  const gbp = (overrides: Partial<PendingTransaction> = {}) =>
    pendingRow({ original_currency: 'GBP', home_currency: 'EUR', ...overrides });

  it('an open hold from another source is confirmed by a within-3% reading (classifyRates confirm path)', async () => {
    const hold = { id: 9, quote: 'GBP', heldRate: '1.30', heldDate: '2020-01-14', source: 'open-er-api', status: 'held' as const };
    const deps = makeDeps({
      readPending: jest.fn(async () => gbp()),
      fetchJson: jest.fn(async () => frank('2020-01-15', { GBP: 1.305 })),
      openHolds: jest.fn(async () => [hold]),
    });
    await resolveRate(deps, { transactionId: VALID_ID });
    expect(deps.upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'GBP', rate: '1.30', date: '2020-01-14' }], 'open-er-api');
    expect(deps.confirmHolds).toHaveBeenCalledWith([9]);
    expect(deps.upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'GBP', rate: '1.305', date: '2020-01-15' }], 'frankfurter-v2');
    expect(deps.restamp).toHaveBeenCalledWith(VALID_ID, ['GBP']);
    // exactly one lookup per (quote, requested date): the accepted row's
    expect(deps.upsertLookups).toHaveBeenCalledWith([
      { quote: 'GBP', requestedDate: '2020-01-15', rateDate: '2020-01-15', source: 'frankfurter-v2' },
    ]);
  });

  it('a dropped hold on (quote, date, source) is skipped: no store, no new hold, no held alert (CR-B02)', async () => {
    const dropped = { id: 5, quote: 'GBP', heldRate: '1.30', heldDate: '2020-01-15', source: 'frankfurter-v2', status: 'dropped' as const };
    const deps = makeDeps({
      readPending: jest.fn(async () => gbp()),
      fetchJson: jest.fn(async () => frank('2020-01-15', { GBP: 1.3 })),
      openHolds: jest.fn(async () => [dropped]),
    });
    await resolveRate(deps, { transactionId: VALID_ID });
    expect(deps.upsertRates).not.toHaveBeenCalled();
    expect(deps.upsertHolds).not.toHaveBeenCalled();
    expect(deps.confirmHolds).not.toHaveBeenCalled();
    expect(deps.insertAlerts).not.toHaveBeenCalledWith([expect.objectContaining({ kind: 'held' })]);
    expect(deps.recordFailures).toHaveBeenCalledWith('2020-01-15', ['GBP'], 'no-usable-rate');
  });

  describe('witness (open.er-api latest) for a Frankfurter value this call held', () => {
    const TODAY = '2026-10-07';
    const prior = [{ quote: 'GBP', rate: '0.86', date: '2026-09-30' }];
    const freshHold = { id: 11, quote: 'GBP', heldRate: '1.3', heldDate: TODAY, source: 'frankfurter-v2', status: 'held' as const };

    const setup = (opts: { witnessGbp?: number; date?: string; witnessThrows?: boolean; frankfurterThrows?: boolean }) => {
      const date = opts.date ?? TODAY;
      const fetchJson = jest.fn(async (url: string) => {
        if (url.startsWith(FRANKFURTER_V2_RATES_URL)) {
          if (opts.frankfurterThrows) throw new Error('down');
          return frank(date, { GBP: 1.3 });
        }
        if (opts.witnessThrows) throw new Error('witness down');
        return openEr('Wed, 07 Oct 2026 00:02:31 +0000', { GBP: opts.witnessGbp ?? 1.31 });
      });
      let reads = 0;
      const openHolds = jest.fn(async () => (reads++ === 0 ? [] : [freshHold]));
      const deps = makeDeps({
        readPending: jest.fn(async () => gbp({ local_date: date })),
        fetchJson,
        storedRatesAround: jest.fn(async () => prior),
        openHolds,
      });
      return { deps, fetchJson };
    };

    it('within 3% -> hold confirmed, held value stored under its own source, lookup recorded, quote relaxed, no held failure', async () => {
      const { deps } = setup({});
      await resolveRate(deps, { transactionId: VALID_ID });
      expect(deps.confirmHolds).toHaveBeenCalledWith([11]);
      expect(deps.upsertRates).toHaveBeenCalledWith([{ base: 'EUR', quote: 'GBP', rate: '1.3', date: TODAY }], 'frankfurter-v2');
      expect(deps.upsertLookups).toHaveBeenCalledWith([
        { quote: 'GBP', requestedDate: TODAY, rateDate: TODAY, source: 'frankfurter-v2' },
      ]);
      expect(deps.restamp).toHaveBeenCalledWith(VALID_ID, ['GBP']);
      expect(deps.recordFailures).not.toHaveBeenCalled();
      expect(deps.clearFailures).toHaveBeenCalledWith(TODAY, ['GBP']);
      expect(deps.insertAlerts).toHaveBeenCalledWith([expect.objectContaining({ kind: 'held', quote: 'GBP' })]);
      expect(deps.insertAlerts).toHaveBeenCalledTimes(1);
    });

    it('beyond 3% -> hold stays, held failure recorded, held value lookup recorded, operator notified', async () => {
      const { deps } = setup({ witnessGbp: 1.45 });
      await resolveRate(deps, { transactionId: VALID_ID });
      expect(deps.confirmHolds).not.toHaveBeenCalled();
      expect(deps.upsertRates).not.toHaveBeenCalled();
      expect(deps.recordFailures).toHaveBeenCalledWith(TODAY, ['GBP'], 'held');
      expect(deps.upsertLookups).toHaveBeenCalledWith([
        { quote: 'GBP', requestedDate: TODAY, rateDate: TODAY, source: 'frankfurter-v2' },
      ]);
      expect(deps.notify).toHaveBeenCalledTimes(1);
    });

    it('requested date 5 days old -> no witness fetch', async () => {
      const { deps, fetchJson } = setup({ date: '2026-10-02' });
      await resolveRate(deps, { transactionId: VALID_ID });
      expect(fetchJson).toHaveBeenCalledTimes(1);
      expect(deps.recordFailures).toHaveBeenCalledWith('2026-10-02', ['GBP'], 'held');
    });

    it('primary source open.er-api -> no witness fetch', async () => {
      const { deps, fetchJson } = setup({ frankfurterThrows: true, witnessGbp: 1.3 });
      await resolveRate(deps, { transactionId: VALID_ID });
      expect(fetchJson.mock.calls.filter(([u]) => String(u).includes('open.er-api'))).toHaveLength(1);
      expect(deps.confirmHolds).not.toHaveBeenCalled();
      expect(deps.recordFailures).toHaveBeenCalledWith(TODAY, ['GBP'], 'held');
    });

    it('witness fetch throws -> treated as not confirmed; the call still succeeds', async () => {
      const { deps } = setup({ witnessThrows: true });
      const result = await resolveRate(deps, { transactionId: VALID_ID });
      expect(result.status).toBe(200);
      expect(deps.confirmHolds).not.toHaveBeenCalled();
      expect(deps.recordFailures).toHaveBeenCalledWith(TODAY, ['GBP'], 'held');
    });
  });
});
