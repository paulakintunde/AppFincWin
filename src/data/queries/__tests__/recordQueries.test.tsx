// Behavior-level proof for Phase 2's simple cached reads (categories, recurring series, undo
// log), the pure home-amount conversion helpers and the shared record context/category-label
// helpers -- same harness as queries.test.tsx: '@/services/supabase' is mocked to a
// FakeSupabase instance so no hook here ever touches the real client.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DbClient } from '@/db/rows';
import type { CategoryRow, FxLatestRow, TransactionRow } from '@/db/rows';
import { convertMinor, EUR_PER_EUR, parseRate } from '@/engine/money';
import { supabase } from '@/services/supabase';
import type { FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { i18n } from '@/i18n';
import { categoryName } from '@/features/record/categoryName';
import { useCategories, useCategoryLookup } from '../categories';
import { useRecurringSeries } from '../recurringSeries';
import { useUndoLog } from '../undoLog';
import { homeAmountFor, latestPerEur, projectionHomeAmount } from '../homeAmount';

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

    const expected = convertMinor(-1000, parseRate('1.1'), 2, parseRate('0.85'), 2);
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
    const expected = convertMinor(500, EUR_PER_EUR, 2, parseRate('0.85'), 2);
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
