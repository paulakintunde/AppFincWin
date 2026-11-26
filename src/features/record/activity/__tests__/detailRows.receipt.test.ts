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
