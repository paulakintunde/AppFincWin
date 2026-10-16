// 05-06 test builders for SnapshotSource. Today is 2026-10-15, home USD, region US; same-currency rows need no rates.
import type { CustomCurrencyRow, FxLatestRow } from '@/db/rows';
import type { ChangeSource, DebtSource, SettingsSource, SnapshotSource } from '../../buildSnapshot';

export type SourceRow = SnapshotSource['rows'][number];
export type SourceSeries = SnapshotSource['series'][number];
export type SourceAccount = SnapshotSource['accounts'][number];

export const TODAY = '2026-10-15';

// 1 EUR = 1.1 USD (units of USD per EUR; EUR itself needs no row)
export const USD_RATE: FxLatestRow = { quote: 'USD', rate: '1.1', rate_date: '2026-10-14', source: 'frankfurter-v2' };
export const CAD_RATE: FxLatestRow = { quote: 'CAD', rate: '1.5', rate_date: '2026-10-13', source: 'frankfurter-v2' };

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function row(overrides: Partial<SourceRow> = {}): SourceRow {
  const original = overrides.original_amount ?? -1_000;
  return {
    id: nextId('r'),
    account_id: 'chk',
    local_date: '2026-09-10',
    original_amount: original,
    original_currency: 'USD',
    home_currency: 'USD',
    home_amount: original,
    orig_per_eur: null,
    status: 'paid',
    is_refund: false,
    transfer_id: null,
    recurring_series_id: null,
    category_id: null,
    deleted_at: null,
    ...overrides,
  };
}

export function account(overrides: Partial<SourceAccount> = {}): SourceAccount {
  return {
    id: nextId('a'),
    name: 'Account',
    kind: 'checking',
    currency: 'USD',
    archived_at: null,
    deleted_at: null,
    ...overrides,
  };
}

export function series(overrides: Partial<SourceSeries> = {}): SourceSeries {
  return {
    id: nextId('s'),
    account_id: 'chk',
    amount: -5_000,
    currency: 'USD',
    freq: 'monthly',
    anchor_date: '2026-06-05',
    end_date: null,
    occurrence_count: null,
    category_id: null,
    deleted_at: null,
    ...overrides,
  };
}

export function debt(overrides: Partial<DebtSource> = {}): DebtSource {
  return {
    id: nextId('d'),
    account_id: null,
    check_id: null,
    series_id: null,
    kind: 'loan',
    currency: 'USD',
    balance: 1_000_000,
    apr: null,
    minimum_payment: 20_000,
    secured: false,
    min_percent: null,
    min_interest_added: null,
    min_floor: null,
    paid_in_full: false,
    version: 1,
    deleted_at: null,
    ...overrides,
  };
}

export function settings(overrides: Partial<SettingsSource> = {}): SettingsSource {
  return {
    currency: null,
    rough_income: null,
    rough_spending: null,
    reserve: null,
    dsr_line: null,
    unsecured_multiple: null,
    investing_floor: null,
    saving_floor: null,
    basis_override: null,
    ...overrides,
  };
}

export function change(overrides: Partial<ChangeSource> = {}): ChangeSource {
  return {
    id: nextId('c'),
    kind: 'income',
    monthly_amount: 10_000,
    currency: 'USD',
    start_month: '2026-11',
    end_month: null,
    deleted_at: null,
    ...overrides,
  };
}

export function paymentLink(overrides: Partial<SnapshotSource['paymentLinks'][number]> = {}): SnapshotSource['paymentLinks'][number] {
  return { check_id: 'chk-1', target_id: 'tgt-1', check_kind: 'buy', ...overrides };
}

export function customCurrency(overrides: Partial<CustomCurrencyRow> = {}): CustomCurrencyRow {
  return {
    id: 'cc-1',
    owner_id: 'u-1',
    code: 'TOK',
    symbol: 'T',
    decimals: 2,
    reference_currency: 'USD',
    unit_value: '0.5',
    as_of: '2026-10-10',
    version: 1,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    ...overrides,
  };
}

export function sourceOf(overrides: Partial<SnapshotSource> = {}): SnapshotSource {
  return {
    today: TODAY,
    homeCurrency: 'USD',
    region: 'US',
    rows: [],
    upcomingRows: [],
    series: [],
    accounts: [],
    balances: {},
    rates: [],
    categories: {},
    settings: null,
    debts: [],
    statementPeriods: [],
    customCurrencies: [],
    changes: [],
    paymentLinks: [],
    writtenRowLinks: [],
    ...overrides,
  };
}

export const CATEGORIES: Record<string, string | null> = {
  'c-inc': 'Income',
  'c-house': 'Housing',
  'c-food': 'Groceries',
  'c-sav': 'Savings',
  'c-debt': 'Debt',
  'c-xfer': 'Transfer',
  'c-custom': null,
};

export const MONTHS = ['2026-06', '2026-07', '2026-08', '2026-09'] as const;

/** Four full months (June..September): 3,000.00 pay on the 1st (series s-pay), 1,000.00 rent and 400.00 food. */
export function household(overrides: Partial<SnapshotSource> = {}, cur = 'USD'): SnapshotSource {
  const c = { original_currency: cur, home_currency: cur };
  const rows: SourceRow[] = [];
  for (const m of MONTHS) {
    rows.push(row({ id: `inc-${m}`, local_date: `${m}-01`, original_amount: 300_000, category_id: 'c-inc', recurring_series_id: 's-pay', ...c }));
    rows.push(row({ id: `rent-${m}`, local_date: `${m}-02`, original_amount: -100_000, category_id: 'c-house', ...c }));
    rows.push(row({ id: `food-${m}`, local_date: `${m}-10`, original_amount: -40_000, category_id: 'c-food', ...c }));
  }
  return sourceOf({
    rows,
    series: [series({ id: 's-pay', amount: 300_000, anchor_date: '2026-06-01', category_id: 'c-inc', currency: cur })],
    accounts: [account({ id: 'chk', name: 'Checking', currency: cur }), account({ id: 'sav', name: 'Savings', kind: 'savings', currency: cur })],
    homeCurrency: cur,
    balances: { chk: 500_000, sav: 200_000 },
    categories: CATEGORIES,
    ...overrides,
  });
}
