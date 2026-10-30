// PURE. 05.3-54 (D-24, D-28): how a readiness answer (a waiver) is stored in the owner-private decide_answers table.
// No React, no I/O. Keys carry no uid: the row is owner-private by created_by and RLS. on_date holds the answer date;
// for nothing_to_add and month_complete it is their `at`. The key regex is exactly the database check (05.3-61).
import type { DecideAnswerRow } from '@/db/decideAnswers';
import type { LocalDate, ReadinessWaiver } from '@/engine/decide/v3';

export const READINESS_WAIVER_KIND = 'readiness_waiver' as const;

/** The same pattern 05.3-61 puts in decide_answers' check. Every key is at most 61 characters (column limit 80). */
export const READINESS_WAIVER_KEY_RE =
  /^(paid-by-other|didnt-happen|no-pay):[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$|^always-other:[0-9a-f-]{36}$|^income-elsewhere$|^(nothing-to-add|month-complete|start-from):\d{4}-\d{2}$/;

const ID_RE = /^[0-9a-f-]{36}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export interface WaiverAnswerShape {
  readonly kind: typeof READINESS_WAIVER_KIND;
  readonly key: string;
  readonly amount: null;
  readonly bool_value: null;
  readonly on_date: LocalDate;
  readonly check_id: null;
}

function checked(re: RegExp, value: string, what: string): string {
  if (!re.test(value)) throw new RangeError(`waiverKeys: bad ${what} "${value}"`);
  return value;
}

/** The stored key of a waiver. Throws RangeError on a bad id, date or month. */
export function waiverKeyOf(w: ReadinessWaiver): string {
  switch (w.kind) {
    case 'paid_by_other':
    case 'didnt_happen':
    case 'no_pay':
      return `${w.kind.replace(/_/g, '-')}:${checked(ID_RE, w.seriesId, 'series id')}:${checked(DATE_RE, w.date, 'date')}`;
    case 'always_other':
      return `always-other:${checked(ID_RE, w.seriesId, 'series id')}`;
    case 'income_elsewhere':
      return 'income-elsewhere';
    case 'nothing_to_add':
    case 'month_complete':
    case 'start_from':
      return `${w.kind.replace(/_/g, '-')}:${checked(MONTH_RE, w.month, 'month')}`;
  }
}

/** The insert shape for a waiver answered on `at`. */
export function waiverAnswerShape(w: ReadinessWaiver, at: LocalDate): WaiverAnswerShape {
  const key = waiverKeyOf(w);
  const onDate = w.kind === 'nothing_to_add' || w.kind === 'month_complete' ? w.at : at;
  return { kind: READINESS_WAIVER_KIND, key, amount: null, bool_value: null, on_date: checked(DATE_RE, onDate, 'date'), check_id: null };
}

/** One stored row back to a waiver; null for a malformed key or a missing answer date where one is needed. */
function waiverOf(key: string, onDate: string | null): ReadinessWaiver | null {
  if (!READINESS_WAIVER_KEY_RE.test(key)) return null;
  const [head, a = '', b = ''] = key.split(':');
  switch (head) {
    case 'paid-by-other':
      return { kind: 'paid_by_other', seriesId: a, date: b };
    case 'didnt-happen':
      return { kind: 'didnt_happen', seriesId: a, date: b };
    case 'no-pay':
      return { kind: 'no_pay', seriesId: a, date: b };
    case 'always-other':
      return { kind: 'always_other', seriesId: a };
    case 'income-elsewhere':
      return { kind: 'income_elsewhere' };
    case 'start-from':
      return { kind: 'start_from', month: a };
    default: {
      // nothing-to-add, month-complete: the answer date is part of the waiver
      if (onDate === null || !DATE_RE.test(onDate)) return null;
      return head === 'nothing-to-add' ? { kind: 'nothing_to_add', month: a, at: onDate } : { kind: 'month_complete', month: a, at: onDate };
    }
  }
}

/** The live waivers in a list of decide_answers rows. Deleted rows, other kinds and malformed keys are dropped, never thrown. */
export function waiversFromAnswers(
  rows: readonly { readonly kind: string; readonly key: string; readonly on_date: string | null; readonly deleted_at?: string | null }[],
): ReadinessWaiver[] {
  const out: ReadinessWaiver[] = [];
  for (const r of rows) {
    if (r.kind !== READINESS_WAIVER_KIND || (r.deleted_at !== null && r.deleted_at !== undefined)) continue;
    const w = waiverOf(r.key, r.on_date);
    if (w !== null) out.push(w);
  }
  return out;
}

/** The live row that stores `w`, or null. */
export function waiverAnswerFor(rows: readonly DecideAnswerRow[], w: ReadinessWaiver): DecideAnswerRow | null {
  const key = waiverKeyOf(w);
  return rows.find((r) => r.kind === READINESS_WAIVER_KIND && r.deleted_at === null && r.key === key) ?? null;
}
