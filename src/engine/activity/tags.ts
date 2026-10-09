/**
 * Row tag rules (UI-SPEC section 4, Confirmed Decision 2, ACT-12, ACT-18).
 * Precedence: Scheduled > Overdue > Due > Pending/Expected > Paid/Received.
 * The word always carries the meaning; colour never does alone.
 */
import { isValidLocalDate } from '../time/localDate';
import type { TxStatus } from './status';

export type RowTagKind =
  | 'paid'
  | 'received'
  | 'pending'
  | 'due'
  | 'overdue'
  | 'expected'
  | 'scheduled'
  | 'moved'
  | 'skipped';
export type RowTagTone = 'paid' | 'unpaid' | 'scheduled' | 'neutral';

export interface TagInput {
  status: TxStatus;
  local_date: string;
  original_amount: number;
  transfer_id: string | null;
  is_refund?: boolean;
}

export interface RowTag {
  kind: RowTagKind;
  tone: RowTagTone;
  refund: boolean;
}

function assertLocalDate(s: string, label: string): void {
  if (!isValidLocalDate(s)) {
    throw new RangeError(`${label}: "${s}" is not a valid local date`);
  }
}

export function rowTag(row: TagInput, today: string): RowTag {
  assertLocalDate(row.local_date, 'rowTag');
  assertLocalDate(today, 'rowTag');
  const refund = row.is_refund === true;
  const future = row.local_date > today;

  if (row.status === 'skipped') return { kind: 'skipped', tone: 'neutral', refund };
  if (row.transfer_id !== null) {
    if (row.status === 'pending' || future) return { kind: 'scheduled', tone: 'scheduled', refund };
    return { kind: 'moved', tone: 'neutral', refund };
  }
  if (future) return { kind: 'scheduled', tone: 'scheduled', refund };
  const outflow = row.original_amount < 0 || refund;
  if (row.status === 'pending') {
    if (!outflow) return { kind: 'expected', tone: 'unpaid', refund };
    // Future-dated lines are Scheduled above, so a pending outflow here is
    // dated today (Due) or earlier (Overdue). 'pending' stays in RowTagKind
    // for the UI-SPEC table but is unreachable once Scheduled wins.
    return { kind: row.local_date < today ? 'overdue' : 'due', tone: 'unpaid', refund };
  }
  return { kind: outflow ? 'paid' : 'received', tone: 'paid', refund };
}
