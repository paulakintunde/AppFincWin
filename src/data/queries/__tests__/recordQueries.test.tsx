// Behavior-level proof for Phase 2's simple cached reads (categories, recurring series, undo
// log), the pure home-amount conversion helpers and the shared record context/category-label
// helpers -- same harness as queries.test.tsx: '@/services/supabase' is mocked to a
// FakeSupabase instance so no hook here ever touches the real client.
import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { AccountRow, CategoryRow, DbClient, FxLatestRow, RecurringSeriesRow, TransactionRow } from '@/db/rows';
import { convertMinor, EUR_PER_EUR, minorUnits, parseRate } from '@/engine/money';
import { monthTotals, monthsForSwitcher } from '@/engine/activity';
import { supabase } from '@/services/supabase';
import type { FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { i18n } from '@/i18n';
import { categoryName } from '@/features/record/categoryName';
import { useCategories, useCategoryLookup } from '../categories';
import { useRecurringSeries } from '../recurringSeries';
import { useUndoLog } from '../undoLog';
import { homeAmountFor, latestPerEur, projectionHomeAmount } from '../homeAmount';
import {
  SEARCH_MIN_CHARS,
  useAccountBalances,
  useHouseholdMemberNames,
  useMonthView,
  useTransactionMonths,
  useTransactionsSearch,
  useTransferLegs,
} from '../activity';

jest.mock('@/services/supabase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createFakeSupabase } = require('@/db/__tests__/fakeSupabase');
  return { supabase: createFakeSupabase() };
});

const fakeClient = supabase as unknown as FakeSupabase & DbClient;
const t = i18n.t.bind(i18n);

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

afterEach(() => {
  fakeClient.calls.length = 0;
});

function categoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 'c1',
    monthly_cap: null,
    is_sample: false,
    owner_id: 'u1',
    builtin_key: null,
    name: 'Custom',
    color_key: 'green',
    is_system: false,
    archived_at: null,
    version: 1,
    updated_by: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

function fxRow(overrides: Partial<FxLatestRow> = {}): FxLatestRow {
  return { quote: 'GBP', rate: '0.85', rate_date: '2026-09-20', source: 'frankfurter-v2', ...overrides };
}

export function txRow(overrides: Partial<TransactionRow> = {}): TransactionRow {
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

describe('useCategories', () => {
  it('selects from categories filtered by owner_id', async () => {
    const rows = [categoryRow()];
    fakeClient.respondWith({ data: rows, error: null, status: 200 });

    const { result } = await renderHook(() => useCategories('u1'), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.data).toEqual(rows));
    expect(fakeClient.calls[0]).toMatchObject({ table: 'categories', method: 'select' });
    expect(fakeClient.calls.find((c) => c.method === 'eq')?.args).toEqual(['owner_id', 'u1']);
  });

  it('stays idle without a userId', async () => {
    const { result } = await renderHook(() => useCategories(undefined), { wrapper: wrapper(newClient()) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fakeClient.calls).toHaveLength(0);
  });
});

describe('useRecurringSeries', () => {
  it('selects from recurring_series filtered by household_id', async () => {
    const rows = [{ id: 's1' }];
    fakeClient.respondWith({ data: rows, error: null, status: 200 });

    const { result } = await renderHook(() => useRecurringSeries('h1'), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.data).toEqual(rows));
    expect(fakeClient.calls[0]).toMatchObject({ table: 'recurring_series', method: 'select' });
    expect(fakeClient.calls.find((c) => c.method === 'eq')?.args).toEqual(['household_id', 'h1']);
  });
});

describe('useUndoLog', () => {
  it('selects from undo_log filtered by owner_id, limited to 12', async () => {
    const rows = [{ id: 'step1' }];
    fakeClient.respondWith({ data: rows, error: null, status: 200 });

    const { result } = await renderHook(() => useUndoLog('u1'), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.data).toEqual(rows));
    expect(fakeClient.calls[0]).toMatchObject({ table: 'undo_log', method: 'select' });
    expect(fakeClient.calls.find((c) => c.method === 'eq')?.args).toEqual(['owner_id', 'u1']);
    expect(fakeClient.calls.find((c) => c.method === 'limit')?.args).toEqual([12]);
  });
});

describe('useCategoryLookup', () => {
  it('exposes transferCategoryId, active picker order and a builtin-key id map', async () => {
    const rows = [
      categoryRow({ id: 'sys-transfer', builtin_key: 'Transfer', name: null, is_system: true }),
      categoryRow({ id: 'sys-settlement', builtin_key: 'Settlement', name: null, is_system: true }),
      categoryRow({ id: 'b-groceries', builtin_key: 'Groceries', name: null, is_system: false }),
      categoryRow({ id: 'b-housing', builtin_key: 'Housing', name: null, is_system: false }),
      categoryRow({
        id: 'custom-1',
        builtin_key: null,
        name: 'Gym',
        is_system: false,
        created_at: '2026-09-05T00:00:00Z',
      }),
    ];
    fakeClient.respondWith({ data: rows, error: null, status: 200 });

    const { result } = await renderHook(() => useCategoryLookup('u1'), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.transferCategoryId).toBe('sys-transfer');
    // Builtins in BUILTIN_CATEGORY_KEYS order (Housing before Groceries), then custom.
    expect(result.current.active.map((c) => c.id)).toEqual(['b-housing', 'b-groceries', 'custom-1']);
    expect(result.current.builtinIds.get('Groceries')).toBe('b-groceries');
    expect(result.current.byId.get('sys-transfer')?.builtin_key).toBe('Transfer');
  });

  it('returns a null transferCategoryId when no system Transfer row exists yet', async () => {
    fakeClient.respondWith({ data: [categoryRow({ id: 'custom-1' })], error: null, status: 200 });

    const { result } = await renderHook(() => useCategoryLookup('u1'), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.transferCategoryId).toBeNull();
  });
});

describe('homeAmountFor', () => {
  it('returns the stored home_amount unchanged when the home currency matches the stamp', () => {
    const row = txRow({ home_currency: 'GBP', home_amount: 5000 });
    expect(homeAmountFor(row, 'GBP', [])).toBe(5000);
  });

  it('cross-converts through the stored orig_per_eur to the requested home currency', () => {
    const row = txRow({ home_currency: 'USD', original_amount: -1000, original_currency: 'USD', orig_per_eur: '1.1' });
    const rates = [fxRow({ quote: 'GBP', rate: '0.85' })];

    const expected = convertMinor(minorUnits(-1000), parseRate('1.1'), 2, parseRate('0.85'), 2);
    expect(homeAmountFor(row, 'GBP', rates)).toBe(expected);
  });

  it('returns null with no usable rate for the requested home currency', () => {
    const row = txRow({ home_currency: 'USD', orig_per_eur: '1.1' });
    expect(homeAmountFor(row, 'GBP', [])).toBeNull();
  });

  it('returns null for a custom-currency leg with no cached rate', () => {
    const row = txRow({ home_currency: 'USD', orig_per_eur: '1.1' });
    expect(homeAmountFor(row, 'GLD1', [])).toBeNull();
  });

  it('returns null when orig_per_eur was never stamped', () => {
    const row = txRow({ home_currency: 'USD', orig_per_eur: null });
    expect(homeAmountFor(row, 'GBP', [fxRow()])).toBeNull();
  });
});

describe('projectionHomeAmount', () => {
  it('returns the amount unchanged for the same currency', () => {
    expect(projectionHomeAmount(500, 'GBP', 'GBP', [])).toBe(500);
  });

  it('converts through EUR_PER_EUR when the projection currency is EUR', () => {
    const rates = [fxRow({ quote: 'GBP', rate: '0.85' })];
    const expected = convertMinor(minorUnits(500), EUR_PER_EUR, 2, parseRate('0.85'), 2);
    expect(projectionHomeAmount(500, 'EUR', 'GBP', rates)).toBe(expected);
  });

  it('returns null with no usable rate', () => {
    expect(projectionHomeAmount(500, 'GLD1', 'GBP', [])).toBeNull();
  });
});

describe('latestPerEur', () => {
  it('returns EUR_PER_EUR for EUR without consulting the rate list', () => {
    expect(latestPerEur([], 'EUR')).toBe(EUR_PER_EUR);
  });

  it('returns null when the code is not in the cached rate list', () => {
    expect(latestPerEur([fxRow({ quote: 'GBP' })], 'JPY')).toBeNull();
  });
});

describe('categoryName', () => {
  it("renders a still-default builtin category's i18n key", () => {
    expect(categoryName({ builtin_key: 'Groceries', name: null }, t)).toBe(t('categories.builtin.Groceries'));
  });

  it("returns a renamed row's own name", () => {
    expect(categoryName({ builtin_key: 'Groceries', name: 'Food' }, t)).toBe('Food');
  });
});

function accountRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc1',
    deleted_at: null,
    is_sample: false,
    household_id: 'h1',
    created_by: 'u1',
    name: 'Everyday chequing',
    kind: 'checking',
    currency: 'USD',
    opening_balance: 10000,
    archived_at: null,
    updated_by: null,
    overdraft_limit: null,
    credit_limit: null,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function seriesRow(overrides: Partial<RecurringSeriesRow> = {}): RecurringSeriesRow {
  return {
    id: 's1',
    is_automatic: false,
    is_sample: false,
    household_id: 'h1',
    created_by: 'u1',
    updated_by: null,
    account_id: 'acc1',
    name: 'Netflix',
    amount: -1099,
    currency: 'USD',
    category_id: null,
    payment_type: null,
    freq: 'monthly',
    anchor_date: '2026-01-15',
    time_zone: 'UTC',
    end_date: null,
    occurrence_count: null,
    materialised_through: null,
    deleted_at: null,
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useMonthView', () => {
  it('maps each row with amountHome/overdue (skipped rows included) and totals equal engine monthTotals', async () => {
    const rows = [
      txRow({ id: 't1', local_date: '2026-09-20', original_amount: -1200, home_currency: 'USD', home_amount: -1200, status: 'paid' }),
      txRow({ id: 't2', local_date: '2026-09-10', original_amount: 500, home_currency: 'USD', home_amount: 500, status: 'pending' }),
      txRow({ id: 't3', local_date: '2026-09-05', original_amount: -300, home_currency: 'USD', home_amount: -300, status: 'skipped' }),
    ];
    fakeClient.respondWith({ data: rows, error: null, status: 200 }); // transactions
    fakeClient.respondWith({ data: [], error: null, status: 200 }); // recurring series
    fakeClient.respondWith({ data: [], error: null, status: 200 }); // fx latest

    const ctx = { householdId: 'h1', homeCurrency: 'USD', today: '2026-09-25' };
    const { result } = await renderHook(() => useMonthView(ctx, '2026-09'), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows.map((r) => r.id)).toEqual(['t1', 't2', 't3']);
    expect(result.current.rows.find((r) => r.id === 't1')?.amountHome).toBe(-1200);
    expect(result.current.rows.find((r) => r.id === 't2')?.overdue).toBe(true); // pending, local_date < today
    expect(result.current.rows.find((r) => r.id === 't3')?.status).toBe('skipped');

    const expectedTotals = monthTotals(
      rows.map((r) => ({ amountHome: r.home_amount, status: r.status, isTransfer: r.transfer_id !== null })),
      []
    );
    expect(result.current.totals).toEqual(expectedTotals);
  });

  it('projects nothing into the materialised month and projects into the month right after it', async () => {
    const series = seriesRow({ anchor_date: '2026-01-15', freq: 'monthly', materialised_through: '2026-10-31' });

    fakeClient.respondWith({ data: [], error: null, status: 200 });
    fakeClient.respondWith({ data: [series], error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });
    const { result: octResult } = await renderHook(
      () => useMonthView({ householdId: 'h1', homeCurrency: 'USD', today: '2026-10-01' }, '2026-10'),
      { wrapper: wrapper(newClient()) }
    );
    await waitFor(() => expect(octResult.current.isLoading).toBe(false));
    expect(octResult.current.projections).toEqual([]);

    fakeClient.respondWith({ data: [], error: null, status: 200 });
    fakeClient.respondWith({ data: [series], error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });
    const { result: novResult } = await renderHook(
      () => useMonthView({ householdId: 'h1', homeCurrency: 'USD', today: '2026-11-01' }, '2026-11'),
      { wrapper: wrapper(newClient()) }
    );
    await waitFor(() => expect(novResult.current.isLoading).toBe(false));
    expect(novResult.current.projections).toHaveLength(1);
    expect(novResult.current.projections[0]?.date).toBe('2026-11-15');
  });

  it('projects nothing when the recurring-series read returns no rows (a soft-deleted series is excluded server-side)', async () => {
    fakeClient.respondWith({ data: [], error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });

    const { result } = await renderHook(
      () => useMonthView({ householdId: 'h1', homeCurrency: 'USD', today: '2026-09-25' }, '2026-09'),
      { wrapper: wrapper(newClient()) }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.projections).toEqual([]);
  });

  it('excludes a transfer pair from totals and reports transferCount 2', async () => {
    const rows = [
      txRow({ id: 't1', account_id: 'acc1', local_date: '2026-09-10', original_amount: -5000, home_amount: -5000, transfer_id: 'xfer1' }),
      txRow({ id: 't2', account_id: 'acc2', local_date: '2026-09-10', original_amount: 5000, home_amount: 5000, transfer_id: 'xfer1' }),
      txRow({ id: 't3', account_id: 'acc1', local_date: '2026-09-11', original_amount: -200, home_amount: -200 }),
    ];
    fakeClient.respondWith({ data: rows, error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });

    const { result } = await renderHook(
      () => useMonthView({ householdId: 'h1', homeCurrency: 'USD', today: '2026-09-25' }, '2026-09'),
      { wrapper: wrapper(newClient()) }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.totals.transferCount).toBe(2);
    expect(result.current.totals.paidOut).toBe(-200);
  });

  it('resolves counterpartAccountId from the other leg when both legs are in the same month, with no extra fetch', async () => {
    const rows = [
      txRow({ id: 't1', account_id: 'acc1', transfer_id: 'xfer1', local_date: '2026-09-10' }),
      txRow({ id: 't2', account_id: 'acc2', transfer_id: 'xfer1', local_date: '2026-09-10' }),
    ];
    fakeClient.respondWith({ data: rows, error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });

    const { result } = await renderHook(
      () => useMonthView({ householdId: 'h1', homeCurrency: 'USD', today: '2026-09-25' }, '2026-09'),
      { wrapper: wrapper(newClient()) }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows.find((r) => r.id === 't1')?.counterpartAccountId).toBe('acc2');
    expect(result.current.rows.find((r) => r.id === 't2')?.counterpartAccountId).toBe('acc1');
    expect(fakeClient.calls.filter((c) => c.method === 'select' && c.table === 'transactions_active')).toHaveLength(1);
  });

  it('fetches the missing leg when a transfer partner sits in another month, and resolves it', async () => {
    const localLeg = txRow({ id: 't1', account_id: 'acc1', transfer_id: 'xfer1', local_date: '2026-09-10' });
    const counterpartLeg = txRow({ id: 't2', account_id: 'acc2', transfer_id: 'xfer1', local_date: '2026-08-29' });

    fakeClient.respondWith({ data: [localLeg], error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });
    fakeClient.respondWith({ data: [localLeg, counterpartLeg], error: null, status: 200 });

    const { result } = await renderHook(
      () => useMonthView({ householdId: 'h1', homeCurrency: 'USD', today: '2026-09-25' }, '2026-09'),
      { wrapper: wrapper(newClient()) }
    );

    await waitFor(() => expect(result.current.rows.find((r) => r.id === 't1')?.counterpartAccountId).toBe('acc2'));
  });

  it('leaves counterpartAccountId null when no partner leg is found anywhere', async () => {
    const localLeg = txRow({ id: 't1', account_id: 'acc1', transfer_id: 'xfer1', local_date: '2026-09-10' });

    fakeClient.respondWith({ data: [localLeg], error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });
    fakeClient.respondWith({ data: [], error: null, status: 200 });
    fakeClient.respondWith({ data: [localLeg], error: null, status: 200 }); // only the local row's own copy comes back

    const { result } = await renderHook(
      () => useMonthView({ householdId: 'h1', homeCurrency: 'USD', today: '2026-09-25' }, '2026-09'),
      { wrapper: wrapper(newClient()) }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows.find((r) => r.id === 't1')?.counterpartAccountId).toBeNull();
  });
});

describe('useTransactionMonths', () => {
  it('returns monthsForSwitcher over the server months', async () => {
    fakeClient.respondWith({ data: [{ month: '2026-07', row_count: 3 }], error: null, status: 200 });

    const { result } = await renderHook(() => useTransactionMonths('h1', '2026-09-15'), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.months).toEqual(monthsForSwitcher(['2026-07'], '2026-09-15'));
    expect(fakeClient.calls.find((c) => c.method === 'rpc')?.args).toEqual(['transaction_months', { p_household_id: 'h1' }]);
  });
});

describe('useTransactionsSearch', () => {
  it('stays disabled for a term shorter than SEARCH_MIN_CHARS', async () => {
    fakeClient.respondWith({ data: [], error: null, status: 200 }); // fxLatest fires unconditionally

    const { result } = await renderHook(
      () => useTransactionsSearch('h1', 'a'.repeat(SEARCH_MIN_CHARS - 1), 'USD', '2026-09-25'),
      { wrapper: wrapper(newClient()) }
    );

    expect(result.current.enabled).toBe(false);
    expect(fakeClient.calls.filter((c) => c.method === 'ilike')).toHaveLength(0);
  });

  it('passes the trimmed term to the search read once it reaches SEARCH_MIN_CHARS', async () => {
    fakeClient.respondWith({ data: [], error: null, status: 200 }); // fxLatest
    fakeClient.respondWith({ data: [txRow({ id: 't1', name: 'Groceries run' })], error: null, status: 200 }); // search

    const { result } = await renderHook(() => useTransactionsSearch('h1', '  gro  ', 'USD', '2026-09-25'), {
      wrapper: wrapper(newClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enabled).toBe(true);
    expect(fakeClient.calls.find((c) => c.method === 'ilike')?.args).toEqual(['name', '%gro%']);
    expect(result.current.rows).toHaveLength(1);
  });
});

describe('read state for offline vs not-found (W6-13 screens WR-01 / IN-04)', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('useTransactionsSearch: offline is pending and paused, never a settled empty result', async () => {
    onlineManager.setOnline(false);
    const { result } = await renderHook(() => useTransactionsSearch('h1', 'groceries', 'USD', '2026-09-25'), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(result.current.fetchStatus).toBe('paused'));
    expect(result.current).toMatchObject({ isPending: true, isSuccess: false, isError: false, rows: [] });
  });

  it('useTransactionsSearch: a successful empty read is isSuccess', async () => {
    fakeClient.respondWith({ data: [], error: null, status: 200 }); // fxLatest
    fakeClient.respondWith({ data: [], error: null, status: 200 }); // search
    const { result } = await renderHook(() => useTransactionsSearch('h1', 'groceries', 'USD', '2026-09-25'), {
      wrapper: wrapper(newClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current).toMatchObject({ isPending: false, fetchStatus: 'idle', rows: [] });
  });

  it('useTransferLegs: offline is pending and paused; a failed read is isError', async () => {
    onlineManager.setOnline(false);
    const offline = await renderHook(() => useTransferLegs('h1', ['T1']), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(offline.result.current.fetchStatus).toBe('paused'));
    expect(offline.result.current).toMatchObject({ isPending: true, isSuccess: false, legs: [] });

    onlineManager.setOnline(true);
    fakeClient.respondWith({ data: null, error: { message: 'boom', code: '500' }, status: 500 });
    const failed = await renderHook(() => useTransferLegs('h1', ['T2']), { wrapper: wrapper(newClient()) });
    await waitFor(() => expect(failed.result.current.isError).toBe(true));
    expect(failed.result.current.isSuccess).toBe(false);
  });
});

describe('useAccountBalances', () => {
  it('builds balance/pendingSum/standing from an account’s own legs only (overdrawn-within)', async () => {
    const account = accountRow({ id: 'acc1', kind: 'checking', currency: 'USD', opening_balance: 10000, overdraft_limit: 50000 });
    fakeClient.respondWith({
      data: [{ account_id: 'acc1', currency: 'USD', paid_sum: '-34000', pending_sum: '1000' }],
      error: null,
      status: 200,
    });

    const { result } = await renderHook(() => useAccountBalances('h1', [account]), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const view = result.current.balances.get('acc1');
    expect(view?.balance).toBe(-24000);
    expect(view?.pendingSum).toBe(1000);
    expect(view?.standing).toEqual({ kind: 'overdrawn-within', overdrawnBy: 24000, limit: 50000 });
  });

  it('reports over-limit standing for a credit account beyond its credit_limit', async () => {
    const account = accountRow({ id: 'acc2', kind: 'credit', currency: 'USD', opening_balance: 0, credit_limit: 100000 });
    fakeClient.respondWith({
      data: [{ account_id: 'acc2', currency: 'USD', paid_sum: '-112000', pending_sum: '0' }],
      error: null,
      status: 200,
    });

    const { result } = await renderHook(() => useAccountBalances('h1', [account]), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const view = result.current.balances.get('acc2');
    expect(view?.standing).toEqual({ kind: 'over-limit', owed: 112000, limit: 100000, overBy: 12000 });
  });
});

describe('useHouseholdMemberNames', () => {
  it('returns a Map of userId -> display_name, omitting nulls', async () => {
    fakeClient.respondWith({
      data: [
        { user_id: 'u1', display_name: 'Ada' },
        { user_id: 'u2', display_name: null },
      ],
      error: null,
      status: 200,
    });

    const { result } = await renderHook(() => useHouseholdMemberNames('h1'), { wrapper: wrapper(newClient()) });

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get('u1')).toBe('Ada');
    expect(result.current.has('u2')).toBe(false);
  });
});
