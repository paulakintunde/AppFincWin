// 10.1-20 (D-05): a split line adds the Categories row (key 'parts', action 'parts'); no row below level 3 or on an unsplit line.
import type { TransactionRow } from '@/db/rows';
import { detailRowsFor } from '../detailRows';

const t = (key: string, params?: Record<string, unknown>) => (key === 'split.tag' ? `${params?.count} categories` : key);

const row = { status: 'paid', local_date: '2026-09-20', original_amount: -5000, transfer_id: null, is_refund: false, is_automatic: false, note: null } as unknown as TransactionRow;
const parts = [
  { categoryId: 'a', amount: -3000 },
  { categoryId: 'b', amount: -1000 },
  { categoryId: 'c', amount: -1000 },
];
const base = { row, today: '2026-09-30', accountName: 'Everyday', counterpartName: null, categoryName: 'Dining', paymentTypeLabel: null, repeatsLabel: null, t };

describe('detailRowsFor split lines', () => {
  it('adds the Categories row with the count and the parts action', () => {
    const spec = detailRowsFor({ ...base, parts, splitOn: true }).find((r) => r.key === 'parts');
    expect(spec).toEqual({ key: 'parts', labelKey: 'split.detail.row', value: '3 categories', action: 'parts' });
  });

  it('has no parts row on an unsplit line or with splits off', () => {
    expect(detailRowsFor({ ...base, parts: null, splitOn: true }).some((r) => r.key === 'parts')).toBe(false);
    expect(detailRowsFor({ ...base, parts, splitOn: false }).some((r) => r.key === 'parts')).toBe(false);
    expect(detailRowsFor({ ...base }).some((r) => r.key === 'parts')).toBe(false);
  });
});
