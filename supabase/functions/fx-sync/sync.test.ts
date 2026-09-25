import { runFxSync, type FxSyncDb } from './sync';
import { FRANKFURTER_V2_RATES_URL } from './parse';
import { OPEN_ER_API_URL } from './openErApi';
import { FRANKFURTER_V2_CURRENCIES_URL } from './currencies';

const FRANKFURTER_RATES_URL = `${FRANKFURTER_V2_RATES_URL}?base=EUR`;
const OPEN_ER_API_FETCH_URL = `${OPEN_ER_API_URL}/EUR`;

const FRANKFURTER_FIXTURE = [{ date: '2026-09-24', base: 'EUR', quote: 'USD', rate: 1.1 }];
const OPEN_ER_FIXTURE = {
  result: 'success',
  base_code: 'EUR',
  time_last_update_utc: 'Thu, 24 Sep 2026 00:02:31 +0000',
  rates: { EUR: 1, USD: 1.11 },
};
const CURRENCIES_FIXTURE = [
  { iso_code: 'USD', iso_numeric: '840', name: 'United States Dollar', symbol: '$', start_date: '1792-01-01', end_date: '2026-09-24' },
];

interface FakeDb extends FxSyncDb {
  calls: {
    upsertRates: Array<{ rows: unknown[]; source: string }>;
    upsertHolds: unknown[][];
    confirmHolds: number[][];
    insertAlerts: Array<{ kind: string; quote?: string; detail?: Record<string, unknown> }>;
    upsertCurrencies: unknown[][];
    holdsCallCount: number;
  };
}

function createFakeDb(opts: {
  recentRates?: FxSyncDb['recentRates'];
  latestRatesOnOrBefore?: FxSyncDb['latestRatesOnOrBefore'];
  holdsSequence?: Array<Awaited<ReturnType<FxSyncDb['holds']>>>;
} = {}): FakeDb {
  const calls: FakeDb['calls'] = {
    upsertRates: [],
    upsertHolds: [],
    confirmHolds: [],
    insertAlerts: [],
    upsertCurrencies: [],
    holdsCallCount: 0,
  };
  const holdsSequence = opts.holdsSequence ?? [[]];

  return {
    recentRates: opts.recentRates ?? (async () => []),
    latestRatesOnOrBefore: opts.latestRatesOnOrBefore ?? (async () => []),
    holds: async () => {
      const index = Math.min(calls.holdsCallCount, holdsSequence.length - 1);
      calls.holdsCallCount += 1;
      return holdsSequence[index];
    },
    upsertRates: async (rows, source) => {
      calls.upsertRates.push({ rows, source });
    },
    upsertHolds: async (rows) => {
      calls.upsertHolds.push(rows);
    },
    confirmHolds: async (ids) => {
      calls.confirmHolds.push(ids);
    },
    insertAlerts: async (alerts) => {
      calls.insertAlerts.push(...alerts);
    },
    upsertCurrencies: async (meta) => {
      calls.upsertCurrencies.push(meta);
    },
    calls,
  };
}

function createFetchJson(map: Record<string, unknown | (() => unknown)>) {
  return async (url: string) => {
    if (!(url in map)) throw new Error(`unexpected fetchJson url: ${url}`);
    const value = map[url];
    if (typeof value === 'function') return (value as () => unknown)();
    return value;
  };
}

describe('runFxSync', () => {
  it('upserts into fx_rates with source frankfurter-v2 when all moves are small, no holds', async () => {
    const db = createFakeDb({ recentRates: async () => [{ quote: 'USD', rate: '1.08', date: '2026-09-23' }] });
    const fetchJson = createFetchJson({
      [FRANKFURTER_RATES_URL]: FRANKFURTER_FIXTURE,
      [FRANKFURTER_V2_CURRENCIES_URL]: CURRENCIES_FIXTURE,
    });

    const result = await runFxSync({ fetchJson, db });

    expect(result).toEqual({ ok: true, source: 'frankfurter-v2', accepted: 1, held: 0, confirmed: 0, currencies: 1 });
    expect(db.calls.upsertRates).toEqual([
      { rows: [{ base: 'EUR', quote: 'USD', rate: '1.1', date: '2026-09-24' }], source: 'frankfurter-v2' },
    ]);
    expect(db.calls.upsertHolds).toEqual([]);
    expect(db.calls.insertAlerts).toEqual([]);
  });

  it('falls back to open.er-api when the Frankfurter fetch throws, and alerts fallback-used', async () => {
    const db = createFakeDb();
    const fetchJson = createFetchJson({
      [FRANKFURTER_RATES_URL]: () => {
        throw new Error('network down');
      },
      [OPEN_ER_API_FETCH_URL]: OPEN_ER_FIXTURE,
      [FRANKFURTER_V2_CURRENCIES_URL]: CURRENCIES_FIXTURE,
    });

    const result = await runFxSync({ fetchJson, db });

    expect(result.source).toBe('open-er-api');
    expect(db.calls.upsertRates).toEqual([
      { rows: [{ base: 'EUR', quote: 'USD', rate: '1.11', date: '2026-09-24' }], source: 'open-er-api' },
    ]);
    expect(db.calls.insertAlerts).toEqual([
      { kind: 'fallback-used', detail: { reason: 'frankfurter-v2 unreachable or unparsable' } },
    ]);
  });

  it('falls back to open.er-api when Frankfurter returns the v1 shape (a parse error)', async () => {
    const db = createFakeDb();
    const fetchJson = createFetchJson({
      [FRANKFURTER_RATES_URL]: { amount: 1.0, base: 'EUR', date: '2026-09-24', rates: { USD: 1.1 } },
      [OPEN_ER_API_FETCH_URL]: OPEN_ER_FIXTURE,
      [FRANKFURTER_V2_CURRENCIES_URL]: CURRENCIES_FIXTURE,
    });

    const result = await runFxSync({ fetchJson, db });

    expect(result.source).toBe('open-er-api');
    expect(db.calls.insertAlerts).toEqual([
      { kind: 'fallback-used', detail: { reason: 'frankfurter-v2 unreachable or unparsable' } },
    ]);
  });

  it('rejects when both sources fail, writing nothing except one sync-failed alert', async () => {
    const db = createFakeDb();
    const fetchJson = createFetchJson({
      [FRANKFURTER_RATES_URL]: () => {
        throw new Error('frankfurter down');
      },
      [OPEN_ER_API_FETCH_URL]: () => {
        throw new Error('open-er-api down too');
      },
    });

    await expect(runFxSync({ fetchJson, db })).rejects.toThrow('open-er-api down too');

    expect(db.calls.insertAlerts).toEqual([{ kind: 'sync-failed', detail: { error: 'open-er-api down too' } }]);
    expect(db.calls.upsertRates).toEqual([]);
    expect(db.calls.upsertHolds).toEqual([]);
    expect(db.calls.upsertCurrencies).toEqual([]);
  });

  it('holds a >10% move, alerts held, and confirms it against a within-3% open.er-api witness in the same run', async () => {
    const db = createFakeDb({
      recentRates: async () => [{ quote: 'USD', rate: '1.00', date: '2026-09-23' }],
      holdsSequence: [
        [], // primary classification: no pre-existing holds
        [{ id: 99, quote: 'USD', heldRate: '1.15', heldDate: '2026-09-24', source: 'frankfurter-v2' }], // after upsertHolds, for the second-source check
      ],
    });
    const fetchJson = createFetchJson({
      [FRANKFURTER_RATES_URL]: [{ date: '2026-09-24', base: 'EUR', quote: 'USD', rate: 1.15 }],
      [OPEN_ER_API_FETCH_URL]: { ...OPEN_ER_FIXTURE, rates: { EUR: 1, USD: 1.16 } }, // 0.87% from 1.15: within 3%
      [FRANKFURTER_V2_CURRENCIES_URL]: CURRENCIES_FIXTURE,
    });

    const result = await runFxSync({ fetchJson, db });
    // Computed the same way plausibility.ts computes it, so this comparison
    // is immune to IEEE 754 rounding on a "round" decimal input like 1.15.
    const expectedChangeRatio = Math.abs(1.15 / 1.0 - 1);

    expect(result).toEqual({ ok: true, source: 'frankfurter-v2', accepted: 0, held: 1, confirmed: 1, currencies: 1 });
    expect(db.calls.upsertHolds).toEqual([
      [{ base: 'EUR', quote: 'USD', rate: '1.15', date: '2026-09-24', priorRate: '1.00', priorDate: '2026-09-23', changeRatio: expectedChangeRatio, source: 'frankfurter-v2' }],
    ]);
    expect(db.calls.insertAlerts).toEqual([
      { kind: 'held', quote: 'USD', detail: { heldRate: '1.15', priorRate: '1.00', changeRatio: expectedChangeRatio, source: 'frankfurter-v2' } },
    ]);
    // The held Frankfurter row is what enters fx_rates -- the open.er-api value is only the witness.
    expect(db.calls.upsertRates).toEqual([
      { rows: [{ base: 'EUR', quote: 'USD', rate: '1.15', date: '2026-09-24' }], source: 'frankfurter-v2' },
    ]);
    expect(db.calls.confirmHolds).toEqual([[99]]);
  });

  it('leaves the hold status as held when the second-source witness disagrees beyond 3%', async () => {
    const db = createFakeDb({
      recentRates: async () => [{ quote: 'USD', rate: '1.00', date: '2026-09-23' }],
      holdsSequence: [
        [],
        [{ id: 99, quote: 'USD', heldRate: '1.15', heldDate: '2026-09-24', source: 'frankfurter-v2' }],
      ],
    });
    const fetchJson = createFetchJson({
      [FRANKFURTER_RATES_URL]: [{ date: '2026-09-24', base: 'EUR', quote: 'USD', rate: 1.15 }],
      [OPEN_ER_API_FETCH_URL]: { ...OPEN_ER_FIXTURE, rates: { EUR: 1, USD: 1.5 } }, // far beyond 3%
      [FRANKFURTER_V2_CURRENCIES_URL]: CURRENCIES_FIXTURE,
    });

    const result = await runFxSync({ fetchJson, db });

    expect(result.held).toBe(1);
    expect(result.confirmed).toBe(0);
    expect(db.calls.confirmHolds).toEqual([]);
    // No fx_rates row is written for the still-held quote.
    expect(db.calls.upsertRates).toEqual([]);
  });

  it('syncs currency metadata into currencies, and a metadata failure does not fail the rate sync', async () => {
    const db = createFakeDb({ recentRates: async () => [{ quote: 'USD', rate: '1.08', date: '2026-09-23' }] });
    const fetchJson = createFetchJson({
      [FRANKFURTER_RATES_URL]: FRANKFURTER_FIXTURE,
      [FRANKFURTER_V2_CURRENCIES_URL]: () => {
        throw new Error('currencies endpoint down');
      },
    });

    await expect(runFxSync({ fetchJson, db })).resolves.toMatchObject({ currencies: 0 });
    expect(db.calls.upsertCurrencies).toEqual([]);
  });

  it('upserts parsed currency metadata unchanged when the endpoint succeeds', async () => {
    const db = createFakeDb({ recentRates: async () => [{ quote: 'USD', rate: '1.08', date: '2026-09-23' }] });
    const fetchJson = createFetchJson({
      [FRANKFURTER_RATES_URL]: FRANKFURTER_FIXTURE,
      [FRANKFURTER_V2_CURRENCIES_URL]: CURRENCIES_FIXTURE,
    });

    await runFxSync({ fetchJson, db });

    expect(db.calls.upsertCurrencies).toEqual([
      [{ code: 'USD', isoNumeric: '840', name: 'United States Dollar', symbol: '$', startDate: '1792-01-01', endDate: '2026-09-24' }],
    ]);
  });

  it('does not revive an operator-dropped hold: no hold upsert, no held alert, no fx_rates row (CR-B02)', async () => {
    const db = createFakeDb({
      recentRates: async () => [{ quote: 'USD', rate: '1.00', date: '2026-09-23' }],
      holdsSequence: [
        [{ id: 42, quote: 'USD', heldRate: '1.15', heldDate: '2026-09-24', source: 'frankfurter-v2', status: 'dropped' }],
      ],
    });
    const fetchJson = createFetchJson({
      [FRANKFURTER_RATES_URL]: [{ date: '2026-09-24', base: 'EUR', quote: 'USD', rate: 1.15 }],
      [FRANKFURTER_V2_CURRENCIES_URL]: CURRENCIES_FIXTURE,
    });

    const result = await runFxSync({ fetchJson, db });

    expect(result).toMatchObject({ accepted: 0, held: 0, confirmed: 0 });
    expect(db.calls.upsertHolds).toEqual([]);
    expect(db.calls.upsertRates).toEqual([]);
    expect(db.calls.insertAlerts).toEqual([]);
  });

  it('confirms exactly the hold this run created, not an older hold for the same quote (WR-B03)', async () => {
    const db = createFakeDb({
      recentRates: async () => [{ quote: 'USD', rate: '1.00', date: '2026-09-23' }],
      holdsSequence: [
        [],
        [
          // An older open.er-api hold from a fallback day, listed first by the DB.
          { id: 7, quote: 'USD', heldRate: '1.16', heldDate: '2026-09-20', source: 'open-er-api' },
          { id: 99, quote: 'USD', heldRate: '1.15', heldDate: '2026-09-24', source: 'frankfurter-v2' },
        ],
      ],
    });
    const fetchJson = createFetchJson({
      [FRANKFURTER_RATES_URL]: [{ date: '2026-09-24', base: 'EUR', quote: 'USD', rate: 1.15 }],
      [OPEN_ER_API_FETCH_URL]: { ...OPEN_ER_FIXTURE, rates: { EUR: 1, USD: 1.16 } },
      [FRANKFURTER_V2_CURRENCIES_URL]: CURRENCIES_FIXTURE,
    });

    await runFxSync({ fetchJson, db });

    expect(db.calls.confirmHolds).toEqual([[99]]);
    expect(db.calls.upsertRates).toEqual([
      { rows: [{ base: 'EUR', quote: 'USD', rate: '1.15', date: '2026-09-24' }], source: 'frankfurter-v2' },
    ]);
  });

  it('compares against the last stored rate however old it is, never waving a move through as "no prior" (WR-B04)', async () => {
    const recentRates = jest.fn(async () => []);
    const latestRatesOnOrBefore = jest.fn(async () => [{ quote: 'USD', rate: '1.00', date: '2026-08-01' }]);
    const db = createFakeDb({ recentRates, latestRatesOnOrBefore });
    const fetchJson = createFetchJson({
      [FRANKFURTER_RATES_URL]: [{ date: '2026-09-24', base: 'EUR', quote: 'USD', rate: 1.5 }],
      [OPEN_ER_API_FETCH_URL]: { ...OPEN_ER_FIXTURE, rates: { EUR: 1, USD: 1.01 } },
      [FRANKFURTER_V2_CURRENCIES_URL]: CURRENCIES_FIXTURE,
    });

    const result = await runFxSync({ fetchJson, db });

    expect(latestRatesOnOrBefore).toHaveBeenCalledWith('2026-09-23');
    expect(recentRates).toHaveBeenCalledWith('2026-09-24');
    expect(result).toMatchObject({ accepted: 0, held: 1 });
    expect(db.calls.upsertRates).toEqual([]);
  });

  it('leaves a sync-failed alert and rethrows when a step after the fetch fails (IN-B02)', async () => {
    const db = createFakeDb({
      recentRates: async () => {
        throw new Error('fx_rates read failed');
      },
    });
    const fetchJson = createFetchJson({ [FRANKFURTER_RATES_URL]: FRANKFURTER_FIXTURE });

    await expect(runFxSync({ fetchJson, db })).rejects.toThrow('fx_rates read failed');
    expect(db.calls.insertAlerts).toEqual([
      { kind: 'sync-failed', detail: { error: 'fx_rates read failed', stage: 'ingest', source: 'frankfurter-v2' } },
    ]);
  });

  it('still rethrows the original error when the sync-failed alert itself cannot be written (IN-B02)', async () => {
    const db = createFakeDb();
    db.upsertRates = async () => {
      throw new Error('upsert failed');
    };
    db.insertAlerts = async () => {
      throw new Error('alerts table unavailable');
    };
    const fetchJson = createFetchJson({ [FRANKFURTER_RATES_URL]: FRANKFURTER_FIXTURE });

    await expect(runFxSync({ fetchJson, db })).rejects.toThrow('upsert failed');
  });
});
