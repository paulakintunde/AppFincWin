/**
 * Month cloning (CONTEXT D-13, D-14; UI-SPEC 6): last month's one-off lines
 * become this month's pending lines, same day clamped to month end. Pure.
 * The caller passes only non-sample rows.
 */
import { normaliseDescription } from '../categorize/guessCategory';
import { minorUnits } from '../money/types';
import { scaleParts, type Part } from '../parts';
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
  /** 10.1-30 (D-28): the source line's category parts, when it is split. */
  parts?: readonly Part[] | null;
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
  /** 10.1-30 (D-28): the parts the clone carries, at the clone's amount; null when the source is not split. */
  parts: Part[] | null;
}

export function cloneCandidates(input: {
  prevRows: readonly CloneSourceRow[];
  currentRows: readonly Pick<CloneSourceRow, 'name'>[];
  targetMonth: string;
  /** The amount a clone uses instead of the source amount, by source id (parts are then scaled to it). */
  amountOverrides?: ReadonlyMap<string, number>;
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
    const amount = input.amountOverrides?.get(r.id) ?? r.original_amount;
    out.push({
      sourceId: r.id,
      localDate: `${input.targetMonth}-${String(day).padStart(2, '0')}`,
      name: r.name,
      amount,
      currency: r.original_currency,
      categoryId: r.category_id,
      accountId: r.account_id,
      paymentType: r.payment_type,
      isRefund: r.is_refund === true,
      parts: cloneParts(r, amount),
    });
  }
  return out;
}

// D-28: the same amount copies the parts as they are; a different amount spreads them by largest remainder so they still add up.
function cloneParts(r: CloneSourceRow, amount: number): Part[] | null {
  if (!r.parts || r.parts.length < 2) return null;
  if (amount === r.original_amount) return r.parts.map((p) => ({ ...p }));
  return scaleParts({ id: r.id, amount: r.original_amount, categoryId: r.category_id, parts: r.parts }, amount)
    .filter((x) => !x.isGap)
    .map((x) => ({ categoryId: x.categoryId, amount: minorUnits(x.amount), label: x.label }));
}
