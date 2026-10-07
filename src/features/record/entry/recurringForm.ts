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

export type RepeatsProblem = 'endBeforeStart' | 'endCountInvalid';

/**
 * Why a Repeats choice cannot be stored, or null when it can. S-CR-03: recurring_series has
 * `check (end_date >= anchor_date)`, and the anchor is the entry's own date, so an end date
 * before it is refused here instead of being sent and rejected by the server.
 */
export function repeatsProblem(v: RepeatsValue, anchorDate: string): RepeatsProblem | null {
  if (v.freq === 'never') return null;
  switch (v.end.kind) {
    case 'never':
      return null;
    case 'date':
      if (!DATE_SHAPE.test(v.end.date)) return 'endBeforeStart';
      return v.end.date < anchorDate ? 'endBeforeStart' : null;
    case 'count':
      return Number.isInteger(v.end.count) && v.end.count >= 1 && v.end.count <= MAX_OCCURRENCE_COUNT
        ? null
        : 'endCountInvalid';
  }
}

/**
 * `null` when it does not repeat; 'invalid' when the end value cannot be stored.
 * @param anchorDate the entry's own date (the series anchor).
 */
export function repeatsToSchedule(v: RepeatsValue, anchorDate: string): ScheduleInput | null | 'invalid' {
  if (v.freq === 'never') return null;
  if (repeatsProblem(v, anchorDate) !== null) return 'invalid';
  switch (v.end.kind) {
    case 'never':
      return { freq: v.freq, endDate: null, occurrenceCount: null };
    case 'date':
      return { freq: v.freq, endDate: v.end.date, occurrenceCount: null };
    case 'count':
      return { freq: v.freq, endDate: null, occurrenceCount: v.end.count };
  }
}

/** S-CR-03: the default "On a date" end -- never earlier than the entry's own date. */
export function defaultEndDate(today: string, entryDate: string): string {
  return entryDate > today ? entryDate : today;
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
  if (!row.recurring_series_id) return false;
  if (row.status === 'pending' && patch.status === 'paid') return false;
  return templateFieldsChanged(patch);
}

/** The keys of a patch that stay on the one row when a series is edited "this and future" (note, status). */
export function nonTemplatePatch(patch: TransactionPatch): TransactionPatch {
  const out: Record<string, unknown> = {};
  const template = TEMPLATE_FIELDS as readonly string[];
  for (const [key, value] of Object.entries(patch)) {
    if (!template.includes(key)) out[key] = value;
  }
  return out as TransactionPatch;
}

/** The calendar day after a YYYY-MM-DD local date (pure calendar arithmetic, no time zone). */
export function dayAfter(localDate: string): string {
  const [y, m, d] = localDate.split('-').map((part) => Number.parseInt(part, 10)) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export interface ThisAndFuturePlan {
  /** The whole edit applied to the opened row itself, or null when the series RPC rewrites it. */
  rowPatch: TransactionPatch | null;
  /** The date the series template edit takes effect from. */
  effectiveFrom: string;
}

/**
 * S-CR-02 / D-07: how "This and future" reaches the occurrence the user opened.
 * edit_recurring_series_from only rewrites *pending* rows on or after the effective date,
 * by soft-deleting them and materialising fresh ones from the new template.
 *  - A pending row with a template-only change: let the RPC rewrite it, from its own
 *    occurrence date. One user action stays one undo step (D-24).
 *  - A paid or skipped row (the RPC never touches it), or a pending row carrying a note or
 *    status change (the RPC would drop it with the soft-deleted row): the whole edit goes to
 *    the row itself, and the series edit starts the day after this occurrence -- after the
 *    later of its scheduled and its new date -- so the RPC can neither soft-delete the row
 *    nor materialise a duplicate of it.
 */
export function thisAndFuturePlan(
  row: Pick<TransactionRow, 'status' | 'occurrence_date' | 'local_date'>,
  patch: TransactionPatch
): ThisAndFuturePlan {
  const scheduled = row.occurrence_date ?? row.local_date;
  const keepsOwnFields = Object.keys(nonTemplatePatch(patch)).length > 0;
  if (row.status === 'pending' && !keepsOwnFields) return { rowPatch: null, effectiveFrom: scheduled };
  const moved = patch.local_date ?? row.local_date;
  const last = moved > scheduled ? moved : scheduled;
  return { rowPatch: patch, effectiveFrom: dayAfter(last) };
}
