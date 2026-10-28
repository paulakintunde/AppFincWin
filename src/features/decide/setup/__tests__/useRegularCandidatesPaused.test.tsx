import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRegularCandidates } from '../steps/useRegularCandidates';

jest.setTimeout(30000);
jest.mock('@/services/supabase', () => ({ supabase: {} }));

const txn = (month: string, name: string) => ({
  id: `${name}-${month}`,
  name,
  original_amount: -4000,
  original_currency: 'USD',
  local_date: `2026-${month}-05`,
  is_sample: false,
  transfer_id: null,
  status: 'posted',
  recurring_series_id: null,
  account_id: 'a1',
  category_id: null,
});
jest.mock('@/db/transactions', () => ({
  fetchTransactionsInRange: async () => ['05', '06', '07', '08', '09'].flatMap((m) => [txn(m, 'Gym'), txn(m, 'Phone')]),
}));
const series = (name: string, over: Record<string, unknown>) => ({
  id: `s-${name}`,
  name,
  amount: -4000,
  currency: 'USD',
  freq: 'monthly',
  anchor_date: '2026-05-05',
  end_date: null,
  end_reason: null,
  deleted_at: null,
  ...over,
});
let mockSeries: Record<string, unknown>[] = [];
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: mockSeries }) }));
jest.mock('@/data/queries/recurringDismissals', () => ({ useRecurringDismissals: () => ({ data: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));

function run() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useRegularCandidates(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

describe('useRegularCandidates paused series', () => {
  it('lists a paused expense series and does not offer its payee again as a candidate', async () => {
    mockSeries = [series('Gym', { end_date: '2026-09-30', end_reason: 'paused' })];
    const { result } = await run();
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));
    expect(result.current.paused.map((s) => s.name)).toEqual(['Gym']);
    expect(result.current.rows.map((r) => r.candidate.name)).toEqual(['Phone']);
  });

  it('does not list a stopped series, and a stopped payee is not counted as Regular', async () => {
    mockSeries = [series('Gym', { end_date: '2026-09-30', end_reason: 'stopped' })];
    const { result } = await run();
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));
    expect(result.current.paused).toEqual([]);
    expect(result.current.rows.find((r) => r.candidate.name === 'Gym')?.state).toBe('unmarked');
  });

  it('counts a live series as Regular', async () => {
    mockSeries = [series('Gym', {})];
    const { result } = await run();
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));
    expect(result.current.rows.find((r) => r.candidate.name === 'Gym')?.state).toBe('regular');
  });
});
