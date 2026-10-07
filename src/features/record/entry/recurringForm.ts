// Pure rules for the recurring controls on the entry sheet (REC-05, REC-06; D-04..D-09).
// No React, no I/O: how a Repeats choice becomes a schedule, which edits touch the series
// template, and when the "This one / This and future" question is asked.
import type { RecurringFreq } from '@/engine/recurring';
import type { TransactionPatch, TransactionRow } from '@/db/rows';
import type { ScheduleInput } from '@/data/mutations/recurringSeries';

export type RepeatsEnd = { kind: 'never' } | { kind: 'date'; date: string } | { kind: 'count'; count: number };
export type RepeatsValue = { freq: 'never' } | { freq: RecurringFreq; end: RepeatsEnd };

/** D-07: the transaction keys that describe the series template. */
export const TEMPLATE_FIELDS = [
  'original_amount',
  'original_currency',
  'account_id',
  'category_id',
  'name',
  'payment_type',
  'local_date',
] as const;

export const MAX_OCCURRENCE_COUNT = 1000;

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** `null` when it does not repeat; 'invalid' when the end value cannot be stored. */
export function repeatsToSchedule(v: RepeatsValue): ScheduleInput | null | 'invalid' {
  if (v.freq === 'never') return null;
  switch (v.end.kind) {
    case 'never':
      return { freq: v.freq, endDate: null, occurrenceCount: null };
    case 'date':
      return DATE_SHAPE.test(v.end.date) ? { freq: v.freq, endDate: v.end.date, occurrenceCount: null } : 'invalid';
    case 'count':
      return Number.isInteger(v.end.count) && v.end.count >= 1 && v.end.count <= MAX_OCCURRENCE_COUNT
        ? { freq: v.freq, endDate: null, occurrenceCount: v.end.count }
        : 'invalid';
  }
}

export function templateFieldsChanged(patch: TransactionPatch): boolean {
  return TEMPLATE_FIELDS.some((key) => patch[key] !== undefined);
}

/**
 * D-06/D-07: ask only when a template field changes on a row that belongs to a series.
 * Recording the actual payment of a pending occurrence (status pending -> paid, with any
 * adjusted values) is never a template edit.
 */
export function needsScopePrompt(row: Pick<TransactionRow, 'recurring_series_id' | 'status'>, patch: TransactionPatch): boolean {
  if (row.recurring_series_id === null) return false;
  if (row.status === 'pending' && patch.status === 'paid') return false;
  return templateFieldsChanged(patch);
}
