import type { TransactionRow } from '@/db/rows';
import { detailRowsFor, statusActionFor } from '../detailRows';

const WORDS: Record<string, string> = {
  'activity.tag.paid': 'Paid',
  'activity.tag.received': 'Received',
  'activity.tag.overdue': 'Overdue',
  'activity.detail.kindRefund': 'Refund to {{category}}',
  'activity.detail.methodAutomatic': 'Automatic',
  'activity.detail.methodManual': 'Manual',
};
const t = (key: string, params?: Record<string, unknown>) =>
  (WORDS[key] ?? key).replace('{{category}}', String(params?.category ?? ''));

function tx(over: Partial<TransactionRow>): TransactionRow {
  return {
    status: 'paid',
    local_date: '2026-09-20',
    original_amount: -1250,
    transfer_id: null,
    is_refund: false,
    is_automatic: false,
    note: null,
    ...over,
  } as unknown as TransactionRow;
}

const base = {
  today: '2026-09-30',
  accountName: 'Everyday',
  counterpartName: null,
  categoryName: 'Groceries',
  paymentTypeLabel: 'Card',
  repeatsLabel: null,
  t,
};

describe('detailRowsFor', () => {
  it('builds the expense rows', () => {
    const rows = detailRowsFor({ ...base, row: tx({}) });
    expect(rows.map((r) => [r.key, r.value, r.tone])).toEqual([
      ['status', 'Paid', 'accent'],
      ['account', 'Everyday', undefined],
      ['paymentType', 'Card', undefined],
      ['repeats', null, undefined],
      ['method', 'Manual', undefined],
      ['note', null, undefined],
    ]);
    expect(rows[1]?.labelKey).toBe('activity.detail.paidFrom');
  });

  it('uses Paid into for income', () => {
    const rows = detailRowsFor({ ...base, row: tx({ original_amount: 500 }) });
    expect(rows[1]?.labelKey).toBe('activity.detail.paidInto');
    expect(rows[0]?.value).toBe('Received');
  });

  it('uses From and To for a transfer, without a Method row', () => {
    const out = detailRowsFor({ ...base, counterpartName: 'Savings', row: tx({ transfer_id: 't1' }) });
    expect(out.map((r) => r.key)).toEqual(['status', 'from', 'to', 'note']);
    expect([out[1]?.value, out[2]?.value]).toEqual(['Everyday', 'Savings']);
    const incoming = detailRowsFor({ ...base, counterpartName: 'Savings', row: tx({ transfer_id: 't1', original_amount: 1250 }) });
    expect([incoming[1]?.value, incoming[2]?.value]).toEqual(['Savings', 'Everyday']);
  });

  it('adds a Kind row for a refund', () => {
    const rows = detailRowsFor({ ...base, row: tx({ is_refund: true, original_amount: 2999 }) });
    const kind = rows.find((r) => r.key === 'kind');
    expect(kind).toMatchObject({ value: 'Refund to Groceries', tone: 'accent' });
    expect(rows[1]?.labelKey).toBe('activity.detail.paidFrom');
  });

  it('shows Repeats and Automatic without changing Status', () => {
    const rows = detailRowsFor({
      ...base,
      repeatsLabel: 'Every month',
      row: tx({ is_automatic: true, status: 'pending', local_date: '2026-09-29' }),
    });
    expect(rows.find((r) => r.key === 'repeats')?.value).toBe('Every month');
    expect(rows.find((r) => r.key === 'method')?.value).toBe('Automatic');
    expect(rows[0]).toMatchObject({ value: 'Overdue', tone: 'danger' });
  });
});

describe('statusActionFor', () => {
  it.each([
    [{ status: 'pending' }, 'markPaid', 'paid'],
    [{ status: 'paid' }, 'markPending', 'pending'],
    [{ status: 'pending', original_amount: 500 }, 'markReceived', 'paid'],
    [{ status: 'paid', original_amount: 500 }, 'markExpected', 'pending'],
    [{ status: 'pending', transfer_id: 't' }, 'markMoved', 'paid'],
    [{ status: 'paid', transfer_id: 't' }, 'markScheduled', 'pending'],
    [{ status: 'pending', is_refund: true, original_amount: 500 }, 'markPaid', 'paid'],
  ])('%j -> %s', (over, key, next) => {
    expect(statusActionFor(tx(over as Partial<TransactionRow>))).toEqual({ key, next });
  });

  it('returns null for a skipped line', () => {
    expect(statusActionFor(tx({ status: 'skipped' }))).toBeNull();
  });
});
