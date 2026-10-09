// Behavior-level proof for the record-polish read hooks (plan 02.2-19): pending split,
// paid-before, month counts, refund-aware month totals and on-device series offers.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient, TransactionRow } from '@/db/rows';
import { supabase } from '@/services/supabase';
import type { FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { useMonthView, useTransactionMonths } from '../activity';
import { useSeriesOffers } from '../offers';
import { usePaidBefore, usePendingSplit } from '../pendingSplit';

jest.mock('@/services/supabase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createFakeSupabase } = require('@/db/__tests__/fakeSupabase');
  return { supabase: createFakeSupabase() };
});

let mockDismissed: ReadonlySet<string> = new Set();
jest.mock('../recordPrefs', () => ({
  useDismissedOffers: () => ({ keys: mockDismissed, isSuccess: true }),
}));

const fakeClient = supabase as unknown as FakeSupabase & DbClient;

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function txRow(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 't1',
    is_refund: false,
    is_automatic: false,
    is_sample: false,
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

afterEach(() => {
  fakeClient.calls.length = 0;
  mockDismissed = new Set();
});

describe('usePendingSplit', () => {
  it('keys legs by account and currency and never touches rates', async () => {
    fakeClient.respondWith({
      data: [{ account_id: 'a1', currency: 'USD', pending_in: '500', pending_out: '-300', pending_count: 2 }],
      error: null,
      status: 200,
    });
    const { result } = await renderHook(() => usePendingSplit('h1'), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(result.current.split.size).toBe(1));
    expect(result.current.split.get('a1:USD')).toEqual({
      accountId: 'a1',
      currency: 'USD',
      pendingIn: '500',
      pendingOut: '-300',
      pendingCount: 2,
    });
    expect(fakeClient.calls.map((c) => c.args?.[0])).not.toContain('resolve-rate');
  });
});

describe('usePaidBefore', () => {
  it('reads per-account legs before the date', async () => {
    fakeClient.respondWith({
      data: [{ account_id: 'a1', currency: 'USD', paid_sum: '1000', paid_home_sum: '1000', unconverted: 0 }],
      error: null,
      status: 200,
    });
    const { result } = await renderHook(() => usePaidBefore('h1', '2026-10-01'), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(result.current.legs).toHaveLength(1));
    expect(result.current.legs[0]).toMatchObject({ paidSum: '1000', paidHomeSum: '1000', unconverted: 0 });
    expect(fakeClient.calls.find((c) => c.method === 'rpc')?.args).toEqual([
      'account_paid_before',
      { p_household_id: 'h1', p_before: '2026-10-01' },
    ]);
  });

  it('stays idle without a date', async () => {
    const { result } = await renderHook(() => usePaidBefore('h1', null), { wrapper: wrapper(newClient()) });
    expect(result.current.legs).toEqual([]);
    expect(fakeClient.calls).toHaveLength(0);
  });
});

describe('useTransactionMonths counts and horizon', () => {
  it('counts per month and includes months through the horizon', async () => {
    fakeClient.respondWith({ data: [{ month: '2026-09', row_count: 4 }], error: null, status: 200 });
    const { result } = await renderHook(() => useTransactionMonths('h1', '2026-10-09', '2026-12'), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(result.current.counts.get('2026-09')).toBe(4));
    expect(result.current.months).toEqual(expect.arrayContaining(['2026-12', '2026-11', '2026-10', '2026-09']));
    expect(result.current.counts.get('2026-12')).toBe(0);
  });
});

describe('useMonthView refund totals', () => {
  it('counts a paid refund as money out, not in', async () => {
    const rows = [
      txRow({ id: 'r1', original_amount: 2000, home_amount: 2000, is_refund: true, local_date: '2026-10-02' }),
      txRow({ id: 'r2', original_amount: 5000, home_amount: 5000, local_date: '2026-10-03' }),
    ];
    fakeClient.respondWith({ data: rows, error: null, status: 200 });
    const { result } = await renderHook(
      () => useMonthView({ householdId: 'h1', homeCurrency: 'USD', today: '2026-10-09' }, '2026-10'),
      { wrapper: wrapper(newClient()) }
    );
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));
    expect(result.current.totals.paidIn).toBe(5000);
    expect(result.current.totals.count).toBe(2);
  });
});

describe('useSeriesOffers', () => {
  function netflix(id: string, date: string, overrides: Partial<TransactionRow> = {}): TransactionRow {
    return txRow({ id, name: 'Netflix', original_amount: -1599, home_amount: -1599, local_date: date, ...overrides });
  }

  const history = [
    netflix('n1', '2026-08-05'),
    netflix('n2', '2026-09-05'),
    netflix('n3', '2026-10-05'),
    netflix('s1', '2026-07-05', { is_sample: true }),
    netflix('x1', '2026-09-06', { transfer_id: 'tr1' }),
  ];

  it('offers a monthly series whose latest row is in the viewed month', async () => {
    fakeClient.respondWith({ data: history, error: null, status: 200 });
    const { result } = await renderHook(() => useSeriesOffers({ householdId: 'h1', userId: 'u1' }, '2026-10'), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(result.current.offers).toHaveLength(1));
    expect(result.current.offers[0]!.latestRowId).toBe('n3');
    expect(result.current.rowsById.get('n3')).toBeDefined();
    const range = fakeClient.calls.filter((c) => c.method === 'gte' || c.method === 'lte').map((c) => c.args);
    expect(range).toEqual([
      ['local_date', '2026-05-01'],
      ['local_date', '2026-10-31'],
    ]);
  });

  it('hides a dismissed offer', async () => {
    fakeClient.respondWith({ data: history, error: null, status: 200 });
    const first = await renderHook(() => useSeriesOffers({ householdId: 'h1', userId: 'u1' }, '2026-10'), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(first.result.current.offers).toHaveLength(1));
    mockDismissed = new Set([first.result.current.offers[0]!.key]);

    fakeClient.respondWith({ data: history, error: null, status: 200 });
    const dismissed = await renderHook(() => useSeriesOffers({ householdId: 'h1', userId: 'u1' }, '2026-10'), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(dismissed.result.current.isLoading).toBe(false));
    expect(dismissed.result.current.offers).toEqual([]);
  });

  it('excludes series-linked rows from detection', async () => {
    fakeClient.respondWith({
      data: history.map((r) => (r.id === 'n1' ? { ...r, recurring_series_id: 'sr1' } : r)),
      error: null,
      status: 200,
    });
    const { result } = await renderHook(() => useSeriesOffers({ householdId: 'h1', userId: 'u1' }, '2026-10'), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.offers).toEqual([]);
  });
});
