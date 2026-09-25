// Task 1 (RED): provisionalStamp is a pure offline conversion mirroring the server's
// stamp_fx_rate() rules (supabase/migrations/20260924000500_fx_stamping.sql) closely enough
// that totals add up before the server ever sees the write -- but it is ALWAYS marked
// rate_pending: true for any non-same-currency conversion, since only the server's own
// stamp is authoritative (D-16, D-17).

import type { CustomCurrencyRow, FxLatestRow, TransactionRow } from '@/db/rows';
import { editStamp, PENDING_UNRESOLVED_STAMP, provisionalStamp } from '../provisional';

const USD_RATE: FxLatestRow = {
  quote: 'USD',
  rate: '1.1483000000',
  rate_date: '2026-09-21',
  source: 'frankfurter-v2',
};

const JPY_RATE: FxLatestRow = {
  quote: 'JPY',
  rate: '180.7000000000',
  rate_date: '2026-09-21',
  source: 'frankfurter-v2',
};

const USD_RATE_OPEN_ER: FxLatestRow = {
  ...USD_RATE,
  source: 'open-er-api',
};

const GLD_CUSTOM: CustomCurrencyRow = {
  id: 'custom-1',
  owner_id: 'user-1',
  code: 'GLD',
  symbol: 'g',
  decimals: 0,
  reference_currency: 'USD',
  unit_value: '2.5000000000',
  as_of: '2026-09-20',
  version: 1,
  created_at: '2026-09-20T00:00:00.000Z',
  updated_at: '2026-09-20T00:00:00.000Z',
};

describe('provisionalStamp', () => {
  it('same currency: home_amount = amount, rate 1.0000000000, source same-currency, not pending', () => {
    const stamp = provisionalStamp({ amount: 500, currency: 'USD', homeCurrency: 'USD' }, [USD_RATE], []);
    expect(stamp).toEqual({
      home_amount: 500,
      rate: '1.0000000000',
      orig_per_eur: null,
      home_per_eur: null,
      rate_date: null,
      rate_source: 'same-currency',
      rate_pending: false,
    });
  });

  it('JPY 1000 -> USD: home_amount 635, rate 0.0063547316, rate_date the shared date, always pending', () => {
    const stamp = provisionalStamp(
      { amount: 1000, currency: 'JPY', homeCurrency: 'USD' },
      [USD_RATE, JPY_RATE],
      []
    );
    expect(stamp.home_amount).toBe(635);
    expect(stamp.rate).toBe('0.0063547316');
    expect(stamp.orig_per_eur).toBe('180.7000000000');
    expect(stamp.home_per_eur).toBe('1.1483000000');
    expect(stamp.rate_date).toBe('2026-09-21');
    expect(stamp.rate_source).toBe('frankfurter-v2');
    expect(stamp.rate_pending).toBe(true);
  });

  it('EUR original uses EUR_PER_EUR (1.0000000000) as its own leg, home leg drives the date', () => {
    const stamp = provisionalStamp({ amount: 1000, currency: 'EUR', homeCurrency: 'USD' }, [USD_RATE], []);
    expect(stamp.orig_per_eur).toBe('1.0000000000');
    expect(stamp.home_per_eur).toBe('1.1483000000');
    expect(stamp.rate_date).toBe('2026-09-21');
    expect(stamp.rate_source).toBe('frankfurter-v2');
    expect(stamp.rate_pending).toBe(true);
  });

  it('custom currency GLD (decimals 0, reference USD, unit_value 2.5): 10 GLD -> 2500 USD, source custom', () => {
    const stamp = provisionalStamp(
      { amount: 10, currency: 'GLD', homeCurrency: 'USD' },
      [USD_RATE],
      [GLD_CUSTOM]
    );
    expect(stamp.home_amount).toBe(2500);
    expect(stamp.rate).toBe('2.5000000000');
    expect(stamp.rate_source).toBe('custom');
    expect(stamp.rate_date).toBe('2026-09-20');
    expect(stamp.rate_pending).toBe(true);
  });

  it('open-er-api cached source propagates as rate_source open-er-api', () => {
    const stamp = provisionalStamp(
      { amount: 1000, currency: 'JPY', homeCurrency: 'USD' },
      [USD_RATE_OPEN_ER, JPY_RATE],
      []
    );
    expect(stamp.rate_source).toBe('open-er-api');
  });

  it('WR-A03: a malformed cached rate or unit_value degrades to the pending stamp instead of throwing', () => {
    expect(
      provisionalStamp({ amount: 1000, currency: 'JPY', homeCurrency: 'USD' }, [USD_RATE, { ...JPY_RATE, rate: 'NaN' }], [])
    ).toEqual(PENDING_UNRESOLVED_STAMP);
    expect(
      provisionalStamp({ amount: 10, currency: 'GLD', homeCurrency: 'USD' }, [USD_RATE], [{ ...GLD_CUSTOM, unit_value: '2,5' }])
    ).toEqual(PENDING_UNRESOLVED_STAMP);
  });

  it('WR-A03: a custom per-EUR rate that rounds to zero, or a result past MAX_SAFE_INTEGER, degrades instead of throwing', () => {
    const huge: CustomCurrencyRow = { ...GLD_CUSTOM, unit_value: '99999999999999.0000000000' };
    // GLD -> USD: GLD per EUR rounds to 0 at 10 dp, so the conversion's denominator is 0.
    expect(provisionalStamp({ amount: 10, currency: 'GLD', homeCurrency: 'USD' }, [USD_RATE], [huge])).toEqual(
      PENDING_UNRESOLVED_STAMP
    );
    expect(
      provisionalStamp({ amount: Number.MAX_SAFE_INTEGER, currency: 'EUR', homeCurrency: 'JPY' }, [JPY_RATE], [])
    ).toEqual(PENDING_UNRESOLVED_STAMP);
  });

  it('missing rate for either side: home_amount null, all rate fields null, still pending', () => {
    const stamp = provisionalStamp({ amount: 1000, currency: 'GBP', homeCurrency: 'USD' }, [USD_RATE], []);
    expect(stamp).toEqual({
      home_amount: null,
      rate: null,
      orig_per_eur: null,
      home_per_eur: null,
      rate_date: null,
      rate_source: null,
      rate_pending: true,
    });
  });
});

describe('editStamp (WR-A06)', () => {
  const GBP_RATE: FxLatestRow = { quote: 'GBP', rate: '0.8500000000', rate_date: '2026-09-21', source: 'frankfurter-v2' };
  const stampedJpyRow: TransactionRow = {
    id: 'tx-1',
    household_id: 'h1',
    account_id: 'acc1',
    created_by: 'user-1',
    original_amount: 1000,
    original_currency: 'JPY',
    home_currency: 'USD',
    home_amount: 640,
    rate: '0.0064000000',
    orig_per_eur: '180.0000000000',
    home_per_eur: '1.1520000000',
    rate_date: '2026-09-10',
    rate_source: 'frankfurter-v2',
    rate_pending: false,
    local_date: '2026-09-10',
    time_zone: 'UTC',
    note: null,
    version: 1,
    created_at: '2026-09-10T00:00:00.000Z',
    updated_at: '2026-09-10T00:00:00.000Z',
  };

  it('D-04: an amount-only edit keeps the stored rate, date, source and pending flag, recomputing home_amount from them', () => {
    const stamp = editStamp(stampedJpyRow, { original_amount: 2000 }, [USD_RATE, JPY_RATE], []);
    // 2000 JPY * 1.152 / 180 = 12.80 USD -- the stored rate, not today's cached 1.1483/180.7.
    expect(stamp).toEqual({
      home_amount: 1280,
      rate: '0.0064000000',
      orig_per_eur: '180.0000000000',
      home_per_eur: '1.1520000000',
      rate_date: '2026-09-10',
      rate_source: 'frankfurter-v2',
      rate_pending: false,
    });
  });

  it("D-05: a re-rating edit converts into the row's own home currency, not the current preference", () => {
    const gbpRow: TransactionRow = { ...stampedJpyRow, home_currency: 'GBP', home_per_eur: '0.8500000000' };
    const stamp = editStamp(gbpRow, { local_date: '2026-09-12' }, [USD_RATE, JPY_RATE, GBP_RATE], []);
    expect(stamp.home_per_eur).toBe('0.8500000000');
    // 1000 JPY * 0.85 / 180.7 = 4.70 GBP
    expect(stamp.home_amount).toBe(470);
    expect(stamp.rate_pending).toBe(true);
  });

  it('a currency change re-rates against the cache', () => {
    const stamp = editStamp(stampedJpyRow, { original_currency: 'EUR' }, [USD_RATE, JPY_RATE], []);
    expect(stamp.orig_per_eur).toBe('1.0000000000');
    expect(stamp.home_amount).toBe(1148);
  });

  it('a same-currency row copies the new amount', () => {
    const same: TransactionRow = {
      ...stampedJpyRow,
      original_currency: 'USD',
      home_amount: 500,
      rate: '1.0000000000',
      orig_per_eur: null,
      home_per_eur: null,
      rate_date: null,
      rate_source: 'same-currency',
    };
    expect(editStamp(same, { original_amount: 750 }, [], [])).toMatchObject({
      home_amount: 750,
      rate_source: 'same-currency',
      rate: '1.0000000000',
    });
  });

  it('an edit that touches neither amount, currency nor date (or repeats them) keeps the whole stamp', () => {
    const kept = {
      home_amount: 640,
      rate: '0.0064000000',
      orig_per_eur: '180.0000000000',
      home_per_eur: '1.1520000000',
      rate_date: '2026-09-10',
      rate_source: 'frankfurter-v2',
      rate_pending: false,
    };
    expect(editStamp(stampedJpyRow, {}, [], [])).toEqual(kept);
    expect(
      editStamp(stampedJpyRow, { original_amount: 1000, local_date: '2026-09-10', original_currency: 'JPY' }, [], [])
    ).toEqual(kept);
  });

  it('an amount-only edit of a never-resolved row falls back to a cached estimate', () => {
    const unresolved: TransactionRow = { ...stampedJpyRow, ...PENDING_UNRESOLVED_STAMP };
    const stamp = editStamp(unresolved, { original_amount: 2000 }, [USD_RATE, JPY_RATE], []);
    expect(stamp.home_amount).toBe(1271);
    expect(stamp.rate_pending).toBe(true);
  });

  it('never throws: a stored rate that cannot be parsed degrades to the pending stamp', () => {
    expect(editStamp({ ...stampedJpyRow, orig_per_eur: 'bad' }, { original_amount: 5 }, [], [])).toEqual(
      PENDING_UNRESOLVED_STAMP
    );
  });
});
