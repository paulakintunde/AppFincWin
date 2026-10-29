import { renderHook } from '@testing-library/react-native';
import { useIncomeContext } from '../useIncomeContext';
import { notPayKey } from '../notPay';

let mockRows: Record<string, unknown>[] = [];
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: mockRows }) }));
jest.mock('@/db/transactions', () => ({ fetchTransactionsInRange: jest.fn() }));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/decide', () => ({ useDecideSettings: () => ({ data: null }) }));
let mockDismissals: Record<string, unknown>[] = [];
jest.mock('@/data/queries/recurringDismissals', () => ({ useRecurringDismissals: () => ({ data: mockDismissals }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
const UA = '11111111-2222-3333-4444-555555555555';
const UB = '99999999-8888-7777-6666-555555555555';
let mockUser = UA;
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: mockUser, householdId: 'h1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
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

  describe('Not my pay answers', () => {
    const refundKey = 'refund - online store|USD|1';
    const acmeKey = 'acme payroll|USD|1';
    const dismissal = (payeeKey: string, over: Record<string, unknown> = {}) => ({ id: `d-${payeeKey}`, household_id: 'h1', payee_key: payeeKey, direction: 'in', deleted_at: null, version: 1, created_by: UA, ...over });
    beforeEach(() => {
      mockUser = UA;
      mockDismissals = [];
      mockRows = [...rowsFor('Refund - Online Store', 1999), ...rowsFor('Acme Payroll', 320000).slice(0, 4)];
    });
    afterEach(() => {
      mockDismissals = [];
    });

    it('offers the refund-named payer when unanswered, carrying its key', async () => {
      const ctx = (await renderHook(() => useIncomeContext())).result.current;
      expect(ctx.found?.payer).toContain('Refund');
      expect(ctx.found?.key).toBe(refundKey);
      expect(ctx.notPay).toEqual([]);
    });

    it('moves on to the next payer when one is marked', async () => {
      mockDismissals = [dismissal(notPayKey(refundKey, UA))];
      const ctx = (await renderHook(() => useIncomeContext())).result.current;
      expect(ctx.found?.payer).toContain('Acme Payroll');
      expect(ctx.notPay).toHaveLength(1);
      expect(ctx.notPay[0]?.payer).toBe('Refund - Online Store');
    });

    it('finds nothing when both payers are marked', async () => {
      mockDismissals = [dismissal(notPayKey(refundKey, UA)), dismissal(notPayKey(acmeKey, UA))];
      expect((await renderHook(() => useIncomeContext())).result.current.found).toBeNull();
    });

    it('a Not regular row for the same key does not hide the payer from pay detection', async () => {
      mockDismissals = [dismissal(refundKey)];
      const ctx = (await renderHook(() => useIncomeContext())).result.current;
      expect(ctx.found?.payer).toContain('Refund');
      expect(ctx.notPay).toEqual([]);
    });

    it('ignores deleted and outgoing not-pay rows', async () => {
      mockDismissals = [dismissal(notPayKey(refundKey, UA), { deleted_at: 'x' }), dismissal(notPayKey(acmeKey, UA), { direction: 'out' })];
      const ctx = (await renderHook(() => useIncomeContext())).result.current;
      expect(ctx.found?.payer).toContain('Refund');
      expect(ctx.notPay).toEqual([]);
    });

    it('falls back to the key name when the history no longer holds the payer', async () => {
      mockRows = [];
      mockDismissals = [dismissal(notPayKey('gone payer|USD|1', UA))];
      expect((await renderHook(() => useIncomeContext())).result.current.notPay[0]?.payer).toBe('gone payer');
    });

    it('another member answer never hides the payer from me, and is not listed for me', async () => {
      mockRows = rowsFor('Acme Payroll', 320000).slice(0, 4);
      mockDismissals = [dismissal(notPayKey(acmeKey, UA), { created_by: UA })];
      mockUser = UB;
      const b = (await renderHook(() => useIncomeContext())).result.current;
      expect(b.found?.payer).toContain('Acme Payroll');
      expect(b.notPay).toEqual([]);
      mockUser = UA;
      const a = (await renderHook(() => useIncomeContext())).result.current;
      expect(a.found).toBeNull();
      expect(a.notPay).toHaveLength(1);
      expect(a.notPay[0]?.payer).toBe('Acme Payroll');
    });

    it('an old-format row hides the payer for its author, with the right payer name', async () => {
      mockRows = rowsFor('Acme Payroll', 320000).slice(0, 4);
      mockDismissals = [dismissal(`not-pay:${acmeKey}`, { created_by: UA })];
      const ctx = (await renderHook(() => useIncomeContext())).result.current;
      expect(ctx.found).toBeNull();
      expect(ctx.notPay[0]?.payer).toBe('Acme Payroll');
      mockUser = UB;
      const other = (await renderHook(() => useIncomeContext())).result.current;
      expect(other.found?.payer).toContain('Acme Payroll');
      expect(other.notPay).toEqual([]);
    });
  });
});
