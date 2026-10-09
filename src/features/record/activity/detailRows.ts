// Pure row builder for the read-only transaction detail sheet (02.2-UI-SPEC section 5,
// CONTEXT D-01). Rows gated off by level or by unbuilt features (Applies to, Entered as,
// Tax deductible, Receipt, household split) are omitted. "Automatic" is a label only: it never
// changes the Status value, which always comes from rowTag (T-02.2-21-01).
import { flowOf, rowTag, type RowTagTone } from '@/engine/activity';
import type { TransactionRow } from '@/db/rows';

export interface DetailRowSpec {
  key: string;
  labelKey: string;
  value: string | null;
  tone?: 'ink' | 'accent' | 'danger' | 'inkMuted';
}

export interface DetailRowsInput {
  row: TransactionRow;
  today: string;
  accountName: string | null;
  counterpartName: string | null;
  categoryName: string | null;
  paymentTypeLabel: string | null;
  repeatsLabel: string | null;
  t: (key: string, params?: Record<string, unknown>) => string;
}

const TONE: Record<RowTagTone, DetailRowSpec['tone']> = {
  paid: 'accent',
  unpaid: 'danger',
  scheduled: 'inkMuted',
  neutral: 'ink',
};

export function detailRowsFor(input: DetailRowsInput): DetailRowSpec[] {
  const { row, today, accountName, counterpartName, categoryName, paymentTypeLabel, repeatsLabel, t } = input;
  const tag = rowTag(row, today);
  const flow = flowOf(row);
  const rows: DetailRowSpec[] = [
    { key: 'status', labelKey: 'activity.detail.status', value: t(`activity.tag.${tag.kind}`), tone: TONE[tag.tone] },
  ];

  if (flow === 'transfer') {
    const outgoing = row.original_amount < 0;
    rows.push({ key: 'from', labelKey: 'activity.detail.from', value: outgoing ? accountName : counterpartName });
    rows.push({ key: 'to', labelKey: 'activity.detail.to', value: outgoing ? counterpartName : accountName });
    rows.push({ key: 'note', labelKey: 'activity.detail.note', value: row.note });
    return rows;
  }

  rows.push({
    key: 'account',
    labelKey: flow === 'in' ? 'activity.detail.paidInto' : 'activity.detail.paidFrom',
    value: accountName,
  });
  if (row.is_refund === true) {
    rows.push({
      key: 'kind',
      labelKey: 'activity.detail.kind',
      value: t('activity.detail.kindRefund', { category: categoryName ?? '' }),
      tone: 'accent',
    });
  }
  rows.push({ key: 'paymentType', labelKey: 'activity.detail.paymentType', value: paymentTypeLabel });
  rows.push({ key: 'repeats', labelKey: 'activity.detail.repeats', value: repeatsLabel });
  rows.push({
    key: 'method',
    labelKey: 'activity.detail.method',
    value: row.is_automatic === true ? t('activity.detail.methodAutomatic') : t('activity.detail.methodManual'),
  });
  rows.push({ key: 'note', labelKey: 'activity.detail.note', value: row.note });
  return rows;
}

export type StatusActionKey = 'markPaid' | 'markReceived' | 'markPending' | 'markExpected' | 'markMoved' | 'markScheduled';

export function statusActionFor(
  row: Pick<TransactionRow, 'status' | 'original_amount' | 'transfer_id' | 'is_refund'>
): { key: StatusActionKey; next: 'paid' | 'pending' } | null {
  if (row.status === 'skipped') return null;
  const pending = row.status === 'pending';
  const flow = flowOf(row);
  if (flow === 'transfer') return pending ? { key: 'markMoved', next: 'paid' } : { key: 'markScheduled', next: 'pending' };
  if (flow === 'in') return pending ? { key: 'markReceived', next: 'paid' } : { key: 'markExpected', next: 'pending' };
  return pending ? { key: 'markPaid', next: 'paid' } : { key: 'markPending', next: 'pending' };
}
