/**
 * Month cloning (CONTEXT D-13, D-14; UI-SPEC 6): last month's one-off lines
 * become this month's pending lines, same day clamped to month end. Pure.
 * The caller passes only non-sample rows.
 */
import { normaliseDescription } from '../categorize/guessCategory';
import { daysInMonth } from './schedule';

export interface CloneSourceRow {
  id: string;
  local_date: string;
  name: string | null;
  original_amount: number;
  original_currency: string;
  category_id: string | null;
  account_id: string;
  payment_type: string | null;
  recurring_series_id: string | null;
  transfer_id: string | null;
  status: 'pending' | 'paid' | 'skipped';
  is_refund?: boolean;
}

export interface CloneCandidate {
  sourceId: string;
  localDate: string;
  name: string | null;
  amount: number;
  currency: string;
  categoryId: string | null;
  accountId: string;
  paymentType: string | null;
  isRefund: boolean;
}

export function cloneCandidates(input: {
  prevRows: readonly CloneSourceRow[];
  currentRows: readonly Pick<CloneSourceRow, 'name'>[];
  targetMonth: string;
}): CloneCandidate[] {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(input.targetMonth);
  if (m === null) throw new RangeError(`Invalid target month: ${input.targetMonth}`);
  const maxDay = daysInMonth(Number(m[1]), Number(m[2]));

  const seen = new Set<string>();
  for (const r of input.currentRows) {
    const n = normaliseDescription(r.name ?? '');
    if (n !== '') seen.add(n);
  }

  const eligible = input.prevRows
    .filter((r) => r.recurring_series_id === null && r.transfer_id === null && r.status !== 'skipped')
    .sort((a, b) => a.local_date.localeCompare(b.local_date) || a.id.localeCompare(b.id));

  const out: CloneCandidate[] = [];
  for (const r of eligible) {
    const n = normaliseDescription(r.name ?? '');
    if (n !== '') {
      if (seen.has(n)) continue;
      seen.add(n);
    }
    const day = Math.min(Number(r.local_date.slice(8, 10)), maxDay);
    out.push({
      sourceId: r.id,
      localDate: `${input.targetMonth}-${String(day).padStart(2, '0')}`,
      name: r.name,
      amount: r.original_amount,
      currency: r.original_currency,
      categoryId: r.category_id,
      accountId: r.account_id,
      paymentType: r.payment_type,
      isRefund: r.is_refund === true,
    });
  }
  return out;
}
