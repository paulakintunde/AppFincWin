import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRegularCandidates } from '../steps/useRegularCandidates';

jest.setTimeout(30000);
jest.mock('@/services/supabase', () => ({ supabase: {} }));

let mockTxns: Record<string, unknown>[] = [];
const txn = (month: string, name: string, seriesId: string | null, over: Record<string, unknown> = {}) => ({
  id: `${name}-${month}`,
  name,
  original_amount: -150000,
  original_currency: 'USD',
  local_date: `2026-${month}-01`,
  is_sample: false,
  transfer_id: null,
  status: 'posted',
  recurring_series_id: seriesId,
  account_id: 'a1',
  category_id: null,
  ...over,
});
jest.mock('@/db/transactions', () => ({ fetchTransactionsInRange: async () => mockTxns }));
const series = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  amount: -150000,
  currency: 'USD',
  freq: 'monthly',
  anchor_date: '2026-08-01',
  end_date: null,
  end_reason: null,
  deleted_at: null,
  ...over,
});
let mockSeries: Record<string, unknown>[] = [];
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: mockSeries }) }));
jest.mock('@/data/queries/recurringDismissals', () => ({ useRecurringDismissals: () => ({ data: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-29' }),
}));

function run() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useRegularCandidates(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
const months = ['08', '09', '10'];
const linked = (id: string) => months.map((m) => txn(m, 'Rent', id));

describe('useRegularCandidates linked rows', () => {
  it('keeps a candidate whose rows are linked to a live series as Regular with that series', async () => {
    mockSeries = [series('S', 'Rent')];
    mockTxns = linked('S');
    const { result } = await run();
    await waitFor(() => expect(result.current.rows.length).toBe(1));
    expect(result.current.rows[0]?.state).toBe('regular');
    expect(result.current.rows[0]?.series?.id).toBe('S');
  });

  it('matches by name when rows are unlinked (pre-fix data shape)', async () => {
    mockSeries = [series('S', 'Rent')];
    mockTxns = months.map((m) => txn(m, 'Rent', null));
    const { result } = await run();
    await waitFor(() => expect(result.current.rows.length).toBe(1));
    expect(result.current.rows[0]?.state).toBe('regular');
    expect(result.current.rows[0]?.series?.id).toBe('S');
  });

  it('does not count a pending occurrence row as evidence', async () => {
    mockSeries = [series('S', 'Rent')];
    mockTxns = [...linked('S'), txn('10', 'RentPending', 'S', { id: 'pending-1', name: 'Rent', local_date: '2026-10-29', status: 'pending' })];
    const { result } = await run();
    await waitFor(() => expect(result.current.rows.length).toBe(1));
    expect(result.current.rows[0]?.candidate.rowIds).not.toContain('pending-1');
  });

  it('keeps rows linked to a paused series under Paused only', async () => {
    mockSeries = [series('P', 'Rent', { end_date: '2026-09-30', end_reason: 'paused' })];
    mockTxns = linked('P');
    const { result } = await run();
    await waitFor(() => expect(result.current.paused.length).toBe(1));
    expect(result.current.rows).toEqual([]);
  });

  it('leaves rows linked to a stopped series out of detection', async () => {
    mockSeries = [series('X', 'Rent', { end_date: '2026-09-30', end_reason: 'stopped' })];
    mockTxns = linked('X');
    const { result } = await run();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows).toEqual([]);
  });

  it('leaves an unlinked candidate with no series unmarked', async () => {
    mockSeries = [];
    mockTxns = months.map((m) => txn(m, 'Rent', null));
    const { result } = await run();
    await waitFor(() => expect(result.current.rows.length).toBe(1));
    expect(result.current.rows[0]?.state).toBe('unmarked');
  });
});
