// 10.1-23 (RCP-01, D-09): the Receipt row of the detail sheet (level 2). Its value reads None, 1 file, N files or Waiting to
// upload, it opens the Receipt sheet (action 'receipt'), and it does not exist when receipts are off (receiptState null).
import type { TransactionRow } from '@/db/rows';
import { i18n } from '@/i18n';
import { detailRowsFor } from '../detailRows';

const t = (key: string, params?: Record<string, unknown>) => String(i18n.t(key as never, params as never));

const row = {
  status: 'paid',
  local_date: '2026-09-20',
  original_amount: -5000,
  transfer_id: null,
  is_refund: false,
  is_automatic: false,
  note: null,
} as unknown as TransactionRow;
const base = { row, today: '2026-09-30', accountName: 'Everyday', counterpartName: null, categoryName: 'Dining', paymentTypeLabel: null, repeatsLabel: null, t };

function receiptRow(receiptState: { count: number; waiting: boolean } | null | undefined) {
  return detailRowsFor({ ...base, receiptState }).find((r) => r.key === 'receipt');
}

describe('detailRowsFor Receipt row', () => {
  it('reads None with no receipts', () => {
    expect(receiptRow({ count: 0, waiting: false })).toEqual({ key: 'receipt', labelKey: 'receipt.row.label', value: 'None', action: 'receipt' });
  });

  it('counts the files', () => {
    expect(receiptRow({ count: 1, waiting: false })?.value).toBe('1 file');
    expect(receiptRow({ count: 3, waiting: false })?.value).toBe('3 files');
  });

  it('says Waiting to upload while a file is still on the phone', () => {
    expect(receiptRow({ count: 2, waiting: true })?.value).toBe('Waiting to upload');
  });

  it('has no Receipt row when receipts are off', () => {
    expect(receiptRow(null)).toBeUndefined();
    expect(receiptRow(undefined)).toBeUndefined();
  });

  it('labels the row Receipt', () => {
    expect(t('receipt.row.label')).toBe('Receipt');
  });
});

// 10.1-27 (D-14; T-10.1-27-02): "Split by item" on a shared line with a receipt, only with household split by item on.
describe('detailRowsFor Split by item row', () => {
  const shared = { ...row, is_shared: true } as TransactionRow;
  const byItem = (over: Partial<Parameters<typeof detailRowsFor>[0]>) =>
    detailRowsFor({ ...base, row: shared, receiptState: { count: 1, waiting: false }, itemSplitOn: true, ...over }).find((r) => r.key === 'byItem');

  it('sits right after the Receipt row on a shared line with a receipt', () => {
    const rows = detailRowsFor({ ...base, row: shared, receiptState: { count: 2, waiting: false }, itemSplitOn: true });
    const at = rows.findIndex((r) => r.key === 'receipt');
    expect(rows[at + 1]).toEqual({ key: 'byItem', labelKey: 'scan.byItem.row', value: null, action: 'byItem' });
    expect(t('scan.byItem.row')).toBe('Split by item');
  });

  it('does not exist on a private line, without a receipt, with the feature off or with receipts off', () => {
    expect(byItem({ row })).toBeUndefined();
    expect(byItem({ receiptState: { count: 0, waiting: false } })).toBeUndefined();
    expect(byItem({ itemSplitOn: false })).toBeUndefined();
    expect(byItem({ itemSplitOn: undefined })).toBeUndefined();
    expect(byItem({ receiptState: null })).toBeUndefined();
  });
});
