/**
 * 05.4 ENG-14 (right-answer case QE-07, settled dispute 12): partial data allowed on the first days of a month.
 *
 * When the new month has no records yet, Decide would otherwise ask for more records first. If the records synced
 * recently and last month is complete, the answer is given from them instead, with the reason records_synced:
 *   - asOf is in the first RECORDS_FRESH_FIRST_DAYS days of its month;
 *   - the current month has no paid lines (Expected rows of recurring bills and pay do not count as records, D-45);
 *   - the previous month is full;
 *   - recordsAsOf is on or before asOf and at most RECORDS_FRESH_SYNC_DAYS days before it.
 * Outside that window nothing changes: records that look behind still ask (needs_input records_look_behind).
 * The month model needs no change for this: with no lines yet, the new month is already projected from the typical month
 * of the full months (last month included), the pay and bill series at their dates, and everyday spending at its usual pace.
 * Pure: asOf comes from the inputs, no clock is read.
 */
import { RECORDS_FRESH_FIRST_DAYS, RECORDS_FRESH_SYNC_DAYS } from '../constants';
import { addYearMonths, dayOfMonth, daysBetween, isValidLocalDate, yearMonthOf } from '../dates';
import type { V3Inputs } from '../types';

export function recordsSynced(inputs: Pick<V3Inputs, 'asOf' | 'months' | 'recordsAsOf'>): boolean {
  const at = inputs.recordsAsOf ?? null;
  if (at === null || !isValidLocalDate(at) || at > inputs.asOf) return false;
  if (dayOfMonth(inputs.asOf) > RECORDS_FRESH_FIRST_DAYS) return false;
  if (daysBetween(at, inputs.asOf) > RECORDS_FRESH_SYNC_DAYS) return false;
  const ym = yearMonthOf(inputs.asOf);
  const current = inputs.months.find((m) => m.month === ym);
  if (current !== undefined && current.lines.some((l) => l.status === 'paid')) return false;
  const prev = inputs.months.find((m) => m.month === addYearMonths(ym, -1));
  return prev !== undefined && prev.full;
}
