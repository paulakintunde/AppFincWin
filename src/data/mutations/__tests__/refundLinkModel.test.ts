import type { TransactionRow } from '@/db/rows';
import { refundPreview, refundTotals } from '../refundLinkModel';

const tx = (id: string, o: Partial<TransactionRow> = {}): TransactionRow =>
  ({ id, original_amount: 1000, deleted_at: null, refund_of: null, ...o }) as TransactionRow;

describe('refundTotals', () => {
  it('sums live positive refunds by purchase and ignores the rest', () => {
    const totals = refundTotals([
      tx('r1', { refund_of: 'p1', original_amount: 400000 }),
      tx('r2', { refund_of: 'p1', original_amount: 300000 }),
      tx('r3', { refund_of: 'p2', original_amount: 50 }),
      tx('gone', { refund_of: 'p1', original_amount: 999, deleted_at: '2026-01-01T00:00:00Z' }),
      tx('out', { refund_of: 'p1', original_amount: -999 }),
      tx('plain'),
      tx('undef', { refund_of: undefined }),
    ]);
    expect(totals.get('p1')).toBe(700000);
    expect(totals.get('p2')).toBe(50);
    expect(totals.size).toBe(2);
  });
});

describe('refundPreview', () => {
  const dates = { purchaseDate: '2026-09-30', refundDate: '2026-10-05' };
  it('full', () => {
    expect(refundPreview({ price: 1000000, alreadyRefunded: 0, refund: 1000000, ...dates })).toEqual({
      kind: 'full',
      purchaseMonth: '2026-09',
      refundMonth: '2026-10',
    });
  });
  it('full when several refunds add up to the price', () => {
    expect(refundPreview({ price: 1000000, alreadyRefunded: 400000, refund: 600000, ...dates }).kind).toBe('full');
  });
  it('partial', () => {
    expect(refundPreview({ price: 1000000, alreadyRefunded: 0, refund: 998000, ...dates })).toEqual({
      kind: 'partial',
      stays: 2000,
      purchaseMonth: '2026-09',
    });
  });
  it('several', () => {
    expect(refundPreview({ price: 1000000, alreadyRefunded: 400000, refund: 300000, ...dates })).toEqual({
      kind: 'several',
      sum: 700000,
      price: 1000000,
    });
  });
  it('over', () => {
    expect(refundPreview({ price: 1000000, alreadyRefunded: 400000, refund: 700000, ...dates })).toEqual({
      kind: 'over',
      extra: 100000,
      refundMonth: '2026-10',
    });
    expect(refundPreview({ price: 1000000, alreadyRefunded: 0, refund: 1003000, ...dates })).toMatchObject({
      kind: 'over',
      extra: 3000,
    });
  });
});
