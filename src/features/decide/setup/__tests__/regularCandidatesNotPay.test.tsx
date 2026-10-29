import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { notPayKey } from '@/features/income/notPay';
import { useRegularCandidates } from '../steps/useRegularCandidates';

jest.setTimeout(30000);
jest.mock('@/services/supabase', () => ({ supabase: {} }));

const KEY = 'bookshop|USD|-1';
const mockTxns = ['2026-06-30', '2026-07-30', '2026-08-30'].map((d, i) => ({
  id: `a${i}`, name: 'Bookshop', original_amount: -1599, original_currency: 'USD', local_date: d, is_sample: false, transfer_id: null,
  status: 'posted', recurring_series_id: null, account_id: 'A', category_id: null, is_refund: false, refund_of: null,
}));
let mockDismissals: Record<string, unknown>[] = [];
jest.mock('@/db/transactions', () => ({ fetchTransactionsInRange: async () => mockTxns }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringDismissals', () => ({ useRecurringDismissals: () => ({ data: mockDismissals }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', userId: 'u1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-09-15' }),
}));

async function stateFor(dismissals: Record<string, unknown>[]) {
  mockDismissals = dismissals;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const out = await renderHook(() => useRegularCandidates(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await waitFor(() => expect(out.result.current.rows.length).toBeGreaterThan(0));
  return out.result.current.rows[0]!.state;
}
const d = (payeeKey: string) => ({ id: 'd1', household_id: 'h1', payee_key: payeeKey, direction: 'out', deleted_at: null, version: 1 });

describe('useRegularCandidates and Not my pay answers (T-05.2-66-01)', () => {
  it('a Not regular row hides the candidate as notRegular', async () => {
    expect(await stateFor([d(KEY)])).toBe('notRegular');
  });
  it('a not-pay row for the same key does not mark the candidate Not regular', async () => {
    expect(await stateFor([d(notPayKey(KEY))])).toBe('unmarked');
  });
});
