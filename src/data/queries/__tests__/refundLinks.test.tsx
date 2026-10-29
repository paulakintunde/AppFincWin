import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TransactionRow } from '@/db/rows';
import { queryKeys } from '../../keys';
import { mergeRefunds, missingPurchaseIds, useRefundLinks } from '../refundLinks';

const mockLinked = jest.fn();
const mockByIds = jest.fn();

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/transactions', () => ({
  fetchLinkedRefunds: (...a: unknown[]) => mockLinked(...a),
  fetchTransactionsByIds: (...a: unknown[]) => mockByIds(...a),
}));

function tx(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 't',
    household_id: 'h1',
    name: 'Shop',
    original_amount: -10000,
    original_currency: 'GBP',
    local_date: '2026-05-10',
    transfer_id: null,
    deleted_at: null,
    refund_of: null,
    ...over,
  } as unknown as TransactionRow;
}

const may = tx({ id: 'purchase', local_date: '2026-05-10' });
const juneRefund = tx({ id: 'ref-june', original_amount: 4000, local_date: '2026-06-02', refund_of: 'purchase' });

function wrapper(qc: QueryClient) {
  return function W({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  jest.clearAllMocks();
  mockLinked.mockResolvedValue([]);
  mockByIds.mockResolvedValue([]);
});

describe('useRefundLinks across months', () => {
  it('refund in June, purchase in May, only June loaded: the purchase is fetched by id', async () => {
    mockLinked.mockResolvedValue([juneRefund]);
    mockByIds.mockResolvedValue([may]);
    const { result } = await renderHook(() => useRefundLinks('h1', [juneRefund], true), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.rowsById.get('purchase')?.id).toBe('purchase'));
    expect(mockByIds).toHaveBeenCalledWith({}, 'h1', ['purchase']);
    expect(result.current.totals.get('purchase')).toBe(4000);
  });

  it('purchase in May, only May loaded: refunds from other months are summed on it', async () => {
    mockLinked.mockResolvedValue([
      juneRefund,
      tx({ id: 'ref-july', original_amount: 1500, local_date: '2026-07-04', refund_of: 'purchase' }),
      tx({ id: 'ref-aug', original_amount: 500, local_date: '2026-08-04', refund_of: 'purchase' }),
      tx({ id: 'other', original_amount: 999, local_date: '2026-08-04', refund_of: 'elsewhere' }),
    ]);
    const { result } = await renderHook(() => useRefundLinks('h1', [may], true), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.totals.get('purchase')).toBe(6000));
    expect(result.current.totals.get('elsewhere')).toBe(999);
    expect(mockByIds).not.toHaveBeenCalled();
  });

  it('a refund on screen counts once even when the fetched copy is also present', async () => {
    mockLinked.mockResolvedValue([juneRefund]);
    const { result } = await renderHook(() => useRefundLinks('h1', [may, juneRefund], true), { wrapper: wrapper(client()) });
    await waitFor(() => expect(mockLinked).toHaveBeenCalled());
    await waitFor(() => expect(result.current.totals.get('purchase')).toBe(4000));
  });

  it('is off when disabled or without a household', async () => {
    const { result } = await renderHook(() => useRefundLinks('h1', [juneRefund], false), { wrapper: wrapper(client()) });
    expect(result.current.totals.size).toBe(0);
    const none = await renderHook(() => useRefundLinks(null, [juneRefund], true), { wrapper: wrapper(client()) });
    expect(none.result.current.totals.size).toBe(0);
    expect(mockLinked).not.toHaveBeenCalled();
    expect(mockByIds).not.toHaveBeenCalled();
  });

  it('keys are household-scoped under the transactions root', () => {
    expect(queryKeys.refundLinks('h1').slice(0, 2)).toEqual(queryKeys.transactionsRoot('h1'));
    expect(queryKeys.refundPurchases('h1', 'a,b').slice(0, 2)).toEqual(queryKeys.transactionsRoot('h1'));
    expect(queryKeys.refundLinks('h2')).not.toEqual(queryKeys.refundLinks('h1'));
  });
});

describe('pure helpers', () => {
  it('mergeRefunds lets the on-screen copy win and drops soft-deleted rows', () => {
    const unlinkedOnScreen = { ...juneRefund, refund_of: null } as TransactionRow;
    const merged = mergeRefunds([juneRefund, tx({ id: 'gone', deleted_at: 'x', refund_of: 'purchase' })], [unlinkedOnScreen]);
    expect(merged.map((r) => [r.id, r.refund_of])).toEqual([['ref-june', null]]);
  });

  it('missingPurchaseIds lists purchases off screen once, sorted, ignoring deleted refunds', () => {
    const second = tx({ id: 'r2', refund_of: 'purchase', original_amount: 1 });
    const deleted = tx({ id: 'r3', refund_of: 'zzz', deleted_at: 'x' });
    expect(missingPurchaseIds([juneRefund, second, deleted, tx({ id: 'r4', refund_of: 'a' })])).toEqual(['a', 'purchase']);
    expect(missingPurchaseIds([may, juneRefund])).toEqual([]);
  });
});
