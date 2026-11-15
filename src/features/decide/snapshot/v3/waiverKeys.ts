// PURE. 06.1-43 (G-1, C-2; 05.3 D-28): readiness answers stored in decide_answers as kind 'readiness_waiver'.
// The key formats match the decide_answers_shape check in migration 20261030000200 exactly, so a key built here always
// satisfies the database, and a stored row reads back as the engine's ReadinessWaiver. Types come from the v3 barrel only.
import type { LocalDate, ReadinessWaiver, YearMonth } from '@/engine/decide/v3';

const UUID_LIKE = /^[0-9a-f-]{36}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

const OCCURRENCE = /^(paid-by-other|didnt-happen|no-pay):([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/;
const ALWAYS_OTHER = /^always-other:([0-9a-f-]{36})$/;
const MONTHLY = /^(nothing-to-add|month-complete|start-from):(\d{4}-\d{2})$/;

function requireUuid(value: string): string {
  if (!UUID_LIKE.test(value)) throw new RangeError('waiverAnswerKey: expected a 36 character id');
  return value;
}

function requireDate(value: string): string {
  if (!DATE.test(value)) throw new RangeError('waiverAnswerKey: date must be YYYY-MM-DD');
  return value;
}

function requireMonth(value: string): string {
  if (!MONTH.test(value)) throw new RangeError('waiverAnswerKey: month must be YYYY-MM');
  return value;
}

/** The decide_answers key of one readiness answer. Throws RangeError on a bad id, date or month. */
export function waiverAnswerKey(w: ReadinessWaiver): string {
  switch (w.kind) {
    case 'paid_by_other':
      return `paid-by-other:${requireUuid(w.seriesId)}:${requireDate(w.date)}`;
    case 'didnt_happen':
      return `didnt-happen:${requireUuid(w.seriesId)}:${requireDate(w.date)}`;
    case 'no_pay':
      return `no-pay:${requireUuid(w.seriesId)}:${requireDate(w.date)}`;
    case 'always_other':
      return `always-other:${requireUuid(w.seriesId)}`;
    case 'income_elsewhere':
      return 'income-elsewhere';
    case 'nothing_to_add':
      return `nothing-to-add:${requireMonth(w.month)}`;
    case 'month_complete':
      return `month-complete:${requireMonth(w.month)}`;
    case 'start_from':
      return `start-from:${requireMonth(w.month)}`;
  }
}

export interface WaiverAnswerLite {
  readonly kind: string;
  readonly key: string;
  readonly on_date: string | null;
}

/**
 * A stored answer row read back as the engine's waiver. Never throws: any other kind, an unknown prefix or a malformed key
 * returns null, so a bad stored row is skipped. nothing_to_add and month_complete take `at` from on_date (the day answered).
 */
export function waiverOfAnswer(row: WaiverAnswerLite): ReadinessWaiver | null {
  if (row.kind !== 'readiness_waiver') return null;
  const occ = OCCURRENCE.exec(row.key);
  if (occ !== null) {
    const seriesId = occ[2] as string;
    const date = occ[3] as LocalDate;
    const prefix = occ[1];
    if (prefix === 'paid-by-other') return { kind: 'paid_by_other', seriesId, date };
    if (prefix === 'didnt-happen') return { kind: 'didnt_happen', seriesId, date };
    return { kind: 'no_pay', seriesId, date };
  }
  const always = ALWAYS_OTHER.exec(row.key);
  if (always !== null) return { kind: 'always_other', seriesId: always[1] as string };
  if (row.key === 'income-elsewhere') return { kind: 'income_elsewhere' };
  const monthly = MONTHLY.exec(row.key);
  if (monthly === null) return null;
  const month = monthly[2] as YearMonth;
  if (monthly[1] === 'start-from') return { kind: 'start_from', month };
  const at = row.on_date;
  if (at === null || !DATE.test(at)) return null;
  return monthly[1] === 'nothing-to-add' ? { kind: 'nothing_to_add', month, at } : { kind: 'month_complete', month, at };
}
