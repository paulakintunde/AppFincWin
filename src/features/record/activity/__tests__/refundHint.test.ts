import type { TransactionRow } from '@/db/rows';
import { refundHintFor } from '../refundPickerModel';

function tx(over: Partial<TransactionRow>): TransactionRow {
  return {
    id: 'x',
    name: 'IKEA',
    original_amount: -40000,
    original_currency: 'GBP',
    local_date: '2026-08-01',
    transfer_id: null,
    deleted_at: null,
    is_refund: false,
    refund_of: null,
    ...over,
  } as unknown as TransactionRow;
}

const today = '2026-10-20';
const row = tx({ id: 'r', name: 'IKEA Refund', original_amount: 4000, local_date: '2026-10-20' });
const p1 = tx({ id: 'p1', local_date: '2026-08-01' });

describe('refundHintFor', () => {
  it('names the matching purchase', () => {
    expect(refundHintFor(row, [p1], today)).toEqual({ purchaseId: 'p1', payee: 'IKEA' });
  });
  it('takes the most recent of two', () => {
    const p2 = tx({ id: 'p2', local_date: '2026-09-05' });
    expect(refundHintFor(row, [p1, p2], today)?.purchaseId).toBe('p2');
  });
  it('is null for old, other-currency, linked, transfer, deleted, money-out and unmatched', () => {
    expect(refundHintFor(row, [tx({ id: 'o', local_date: '2025-09-01' })], today)).toBeNull();
    expect(refundHintFor(row, [tx({ id: 'o', original_currency: 'USD' })], today)).toBeNull();
    expect(refundHintFor({ ...row, refund_of: 'p1' }, [p1], today)).toBeNull();
    expect(refundHintFor({ ...row, transfer_id: 't' }, [p1], today)).toBeNull();
    expect(refundHintFor({ ...row, deleted_at: '2026-10-21' }, [p1], today)).toBeNull();
    expect(refundHintFor({ ...row, original_amount: -4000 }, [p1], today)).toBeNull();
    expect(refundHintFor(row, [tx({ id: 'o', name: 'Argos' })], today)).toBeNull();
    expect(refundHintFor(row, [tx({ id: 'o', deleted_at: '2026-09-01' })], today)).toBeNull();
  });
});
