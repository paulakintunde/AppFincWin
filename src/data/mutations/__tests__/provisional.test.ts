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

  it('RD-01: a 1,000,000,000 unit_value (e.g. a high-value investment) resolves a real provisional rate, not pending-unresolved', () => {
    // RD-01 removed the client's static unit_value bound; this only proves the provisional
    // estimate still resolves (a real, non-pending-unresolved rate) at that scale. RD-03
    // covers the estimate's *precision* (see provisional's own exact-conversion tests).
    const bigUnit: CustomCurrencyRow = { ...GLD_CUSTOM, unit_value: '1000000000.0000000000' };
    const stamp = provisionalStamp({ amount: 1, currency: 'GLD', homeCurrency: 'USD' }, [USD_RATE], [bigUnit]);
    expect(stamp.rate_source).toBe('custom');
    expect(stamp.rate_pending).toBe(true);
    expect(stamp.home_amount).not.toBeNull();
    expect(stamp.orig_per_eur).not.toBeNull();
  });

  it('IN-A01: a same-currency row is dated its own local_date, as the server does', () => {
    const stamp = provisionalStamp({ amount: 500, currency: 'USD', homeCurrency: 'USD', localDate: '2026-09-24' }, [], []);
    expect(stamp.rate_date).toBe('2026-09-24');
  });

  it('IN-A01: the EUR leg is dated local_date, so rate_date is least(leg dates) like per_eur_rate()', () => {
    // A backdated entry: the cached USD rate is newer than the transaction.
    const backdated = provisionalStamp(
      { amount: 1000, currency: 'EUR', homeCurrency: 'USD', localDate: '2026-09-15' },
      [USD_RATE],
      []
    );
    expect(backdated.rate_date).toBe('2026-09-15');
    const current = provisionalStamp(
      { amount: 1000, currency: 'USD', homeCurrency: 'EUR', localDate: '2026-09-24' },
      [USD_RATE],
      []
    );
    expect(current.rate_date).toBe('2026-09-21');
  });

  it('IN-A01: a custom currency referencing EUR takes least(local_date, as_of)', () => {
    const eurRef: CustomCurrencyRow = { ...GLD_CUSTOM, reference_currency: 'EUR', as_of: '2026-09-20' };
    const stamp = provisionalStamp(
      { amount: 10, currency: 'GLD', homeCurrency: 'USD', localDate: '2026-09-18' },
      [USD_RATE],
      [eurRef]
    );
    expect(stamp.rate_date).toBe('2026-09-18');
  });

  it('IN-A02: a custom per-EUR rate that rounds to 0 is no rate at all -- never a silent zero conversion into it', () => {
    const huge: CustomCurrencyRow = { ...GLD_CUSTOM, unit_value: '99999999999999.0000000000' };
    // USD -> GLD: GLD would be the target leg, where a 0 rate converts everything to 0.
    expect(provisionalStamp({ amount: 1000, currency: 'USD', homeCurrency: 'GLD' }, [USD_RATE], [huge])).toEqual(
      PENDING_UNRESOLVED_STAMP
    );
  });

  it('IN-A02: a cross rate that rounds to 0 leaves the row fully pending', () => {
    const tinyHome: FxLatestRow = { quote: 'XXX', rate: '99999999999999', rate_date: '2026-09-21', source: 'frankfurter-v2' };
    expect(provisionalStamp({ amount: 1, currency: 'XXX', homeCurrency: 'USD' }, [USD_RATE, tinyHome], [])).toEqual(
      PENDING_UNRESOLVED_STAMP
    );
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

  describe('RD-03: exact conversion for custom-currency legs (mirrors convert_minor_exact, no rounded 10dp intermediate)', () => {
    // Same per-EUR rates and expected outputs as supabase/tests/fixtures/money-conversion-cases.json's
    // `convertExact` cases -- the provisional (offline) stamp must land on exactly the same
    // home_amount the server's exact path would, not the old rounded-per-EUR-intermediate value.
    const USD_RATE_RD03: FxLatestRow = { quote: 'USD', rate: '1.1734000000', rate_date: '2026-09-21', source: 'frankfurter-v2' };
    const JPY_RATE_RD03: FxLatestRow = { quote: 'JPY', rate: '180.7000000000', rate_date: '2026-09-21', source: 'frankfurter-v2' };
    const USD_RATE_1483: FxLatestRow = { quote: 'USD', rate: '1.1483000000', rate_date: '2026-09-21', source: 'frankfurter-v2' };
    const GOLD_CUSTOM: CustomCurrencyRow = {
      id: 'custom-gold',
      owner_id: 'user-1',
      code: 'GOLD',
      symbol: 'G',
      decimals: 2,
      reference_currency: 'USD',
      unit_value: '60000.0000000000',
      as_of: '2026-09-20',
      version: 1,
      created_at: '2026-09-20T00:00:00.000Z',
      updated_at: '2026-09-20T00:00:00.000Z',
    };

    it('1.00 GOLD (unit_value 60000 USD) -> USD: exactly 6,000,000 minor units, not the rounded 5,999,990', () => {
      const stamp = provisionalStamp({ amount: 100, currency: 'GOLD', homeCurrency: 'USD' }, [USD_RATE_RD03], [GOLD_CUSTOM]);
      expect(stamp.home_amount).toBe(6000000);
      expect(stamp.rate_source).toBe('custom');
      expect(stamp.rate_pending).toBe(true);
    });

    it('-1.00 GOLD -> USD: a negative amount stays exact', () => {
      const stamp = provisionalStamp({ amount: -100, currency: 'GOLD', homeCurrency: 'USD' }, [USD_RATE_RD03], [GOLD_CUSTOM]);
      expect(stamp.home_amount).toBe(-6000000);
    });

    it('6,000,000.00 USD -> GOLD: the home leg is the custom one (inverse of the first case)', () => {
      const stamp = provisionalStamp(
        { amount: 600000000, currency: 'USD', homeCurrency: 'GOLD' },
        [USD_RATE_RD03],
        [GOLD_CUSTOM]
      );
      expect(stamp.home_amount).toBe(10000);
    });

    it('1e9-unit asset (0dp, 1 unit = 1,000,000,000 JPY) -> USD', () => {
      const megaAsset: CustomCurrencyRow = {
        ...GOLD_CUSTOM,
        id: 'custom-mega',
        code: 'MEGA',
        decimals: 0,
        reference_currency: 'JPY',
        unit_value: '1000000000.0000000000',
      };
      const stamp = provisionalStamp(
        { amount: 1, currency: 'MEGA', homeCurrency: 'USD' },
        [JPY_RATE_RD03, USD_RATE_1483],
        [megaAsset]
      );
      expect(stamp.home_amount).toBe(635473160);
    });

    it('both legs custom, same USD reference (1 GOLD = 60000 USD, 1 SILVER = 1000 USD): 1 GOLD = 60 SILVER exactly', () => {
      const gold0dp: CustomCurrencyRow = { ...GOLD_CUSTOM, decimals: 0 };
      const silver: CustomCurrencyRow = {
        ...GOLD_CUSTOM,
        id: 'custom-silver',
        code: 'SILVER',
        decimals: 0,
        reference_currency: 'USD',
        unit_value: '1000.0000000000',
      };
      const stamp = provisionalStamp(
        { amount: 1, currency: 'GOLD', homeCurrency: 'SILVER' },
        [USD_RATE_RD03],
        [gold0dp, silver]
      );
      expect(stamp.home_amount).toBe(60);
    });

    it('a 3-decimal custom leg (1.500 units, 1 unit = 2.5 USD) -> a 0-decimal ISO currency (JPY)', () => {
      const unit: CustomCurrencyRow = {
        ...GOLD_CUSTOM,
        id: 'custom-unit',
        code: 'UNIT',
        decimals: 3,
        reference_currency: 'USD',
        unit_value: '2.5000000000',
      };
      const stamp = provisionalStamp({ amount: 1500, currency: 'UNIT', homeCurrency: 'JPY' }, [USD_RATE_1483, JPY_RATE_RD03], [unit]);
      expect(stamp.home_amount).toBe(590);
    });
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
