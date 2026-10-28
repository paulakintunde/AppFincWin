// 05.2-33 (DSU-16, D-06..D-08): pure candidate lists for the refund picker. Both directions are capped at 50 and put
// the same payee first, then the newest. No React, no I/O; amounts are integer minor units.
import type { TransactionRow } from '@/db/rows';
import type { ActivityRowView } from '@/data/queries/activity';
import { payerKeyOf } from '@/data/mutations/incomeTagModel';

/** A row from a by-id read (no counterpart, no overdue flag) as the view the detail sheet takes. */
export function asActivityRow(row: TransactionRow): ActivityRowView {
  return 'amountHome' in row
    ? (row as ActivityRowView)
    : { ...row, amountHome: null, overdue: false, counterpartAccountId: null };
}

export const PICKER_CAP = 50;
export const PICKER_WINDOW_MONTHS = 12;

export type PickerDirection = 'refund->purchase' | 'purchase->refund';

/** The date `months` calendar months before `date` (YYYY-MM-DD), day clamped to the month's length. */
export function monthsBefore(date: string, months: number): string {
  const [y, m, d] = date.split('-').map((p) => parseInt(p, 10)) as [number, number, number];
  const total = y * 12 + (m - 1) - months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

const isLive = (r: TransactionRow): boolean => r.deleted_at === null && r.transfer_id === null;

/** Same payee first, then newest (date, then created_at, then id for a stable order). */
function order(rows: TransactionRow[], payerKey: string | null): TransactionRow[] {
  const same = (r: TransactionRow): number => (payerKey !== null && payerKeyOf(r.name) === payerKey ? 0 : 1);
  return rows.sort((a, b) => {
    const s = same(a) - same(b);
    if (s !== 0) return s;
    if (a.local_date !== b.local_date) return a.local_date < b.local_date ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  });
}

/** Search by payee, note or amount. `amountText` is the amount as the user sees it ("£12.50"). */
export function matchesQuery(row: TransactionRow, query: string, amountText: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if ((row.name ?? '').toLowerCase().includes(q) || (row.note ?? '').toLowerCase().includes(q)) return true;
  const qNum = q.replace(/[^0-9.]/g, '');
  return qNum !== '' && amountText.replace(/[^0-9.]/g, '').includes(qNum);
}

export interface PickerInput {
  /** The fixed side: the refund in 'refund->purchase', the purchase in 'purchase->refund'. */
  anchor: TransactionRow;
  rows: readonly TransactionRow[];
  /** Latest date a refund can have (today). */
  today: string;
  query: string;
  amountText: (row: TransactionRow) => string;
}

/** Expenses in the refund's currency in the 12 months up to the refund date. */
export function purchaseCandidates(input: PickerInput): TransactionRow[] {
  const { anchor, rows, query, amountText } = input;
  const from = monthsBefore(anchor.local_date, PICKER_WINDOW_MONTHS);
  const list = rows.filter(
    (r) =>
      isLive(r) &&
      r.id !== anchor.id &&
      r.original_amount < 0 &&
      r.original_currency === anchor.original_currency &&
      r.local_date >= from &&
      r.local_date <= anchor.local_date &&
      matchesQuery(r, query, amountText(r))
  );
  return order(list, payerKeyOf(anchor.name)).slice(0, PICKER_CAP);
}

/** Unlinked money-in rows in the purchase's currency dated on or after the purchase. */
export function refundCandidates(input: PickerInput): TransactionRow[] {
  const { anchor, rows, today, query, amountText } = input;
  const list = rows.filter(
    (r) =>
      isLive(r) &&
      r.id !== anchor.id &&
      r.original_amount > 0 &&
      (r.refund_of ?? null) === null &&
      r.original_currency === anchor.original_currency &&
      r.local_date >= anchor.local_date &&
      r.local_date <= today &&
      matchesQuery(r, query, amountText(r))
  );
  return order(list, payerKeyOf(anchor.name)).slice(0, PICKER_CAP);
}
