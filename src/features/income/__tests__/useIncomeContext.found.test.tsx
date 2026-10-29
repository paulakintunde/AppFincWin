import { renderHook } from '@testing-library/react-native';
import { useIncomeContext } from '../useIncomeContext';

let mockRows: Record<string, unknown>[] = [];
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: mockRows }) }));
jest.mock('@/db/transactions', () => ({ fetchTransactionsInRange: jest.fn() }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: null }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));

const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
function rowsFor(name: string, amount: number, over: Record<string, unknown> = {}) {
  return months.map((m, i) => ({
    id: `${name}-${i}`,
    name,
    original_amount: amount,
    original_currency: 'USD',
    local_date: `${m}-25`,
    account_id: 'a1',
    is_sample: false,
    transfer_id: null,
    status: 'posted',
    recurring_series_id: null,
    is_refund: false,
    refund_of: null,
    ...over,
  }));
}

describe('useIncomeContext found payer (F-02)', () => {
  it('never offers refunds as pay', async () => {
    mockRows = rowsFor('Refund - Online Store', 1999, { is_refund: true });
    expect((await renderHook(() => useIncomeContext())).result.current.found).toBeNull();
  });

  it('never offers refund-linked rows as pay', async () => {
    mockRows = rowsFor('Refund - Online Store', 1999, { refund_of: 'orig' });
    expect((await renderHook(() => useIncomeContext())).result.current.found).toBeNull();
  });

  it('still finds the real payer alongside refunds', async () => {
    mockRows = [...rowsFor('Refund - Online Store', 1999, { is_refund: true }), ...rowsFor('Acme Payroll', 320000)];
    expect((await renderHook(() => useIncomeContext())).result.current.found?.payer).toContain('Acme Payroll');
  });
});
