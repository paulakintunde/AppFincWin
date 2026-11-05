/**
 * 05.4 BO-05 (05.4-27, Variant C, D-108): the save-for-it ready date. Pure; no clock (asOf is in the inputs).
 *
 * saveForItReadyDate(prepared, check, saved) is the day the purchase is ready when saving for it, the same date the Not-yet answer
 * gives (the engine's own ladder and cash path; never a second sum that could disagree):
 * - Money already saved for it is counted once (I71). Money in accounts Decide already counts (the everyday accounts, extra savings
 *   above the safety net's size) is never added again; money set aside in a kept savings account counts, up to what those accounts
 *   hold, like the item's own envelope. Locked safety-net money never counts (D-61).
 * - A plan saves for its up-front part only (deposit and up-front fees, SO-08); its payments come from the usual month later.
 * - Fits now (Fits, Fits from spare money, or a fitting plan) = the purchase date; Not yet = its ready date, a ready month read as its
 *   last day (D-80); anything else (a dip into the overdraft or the net, Short each month, an ask, no ready date) = null.
 */
import { addDays, addYearMonths } from '../dates';
import { keptSavings } from '../judge/judge';
import { judgeCheckWith, type Prepared } from '../prepare';
import type { CheckV2, LocalDate } from '../types';

/** What of `saved` counts: never below 0, never more than the kept savings accounts hold. */
export function savedCounted(prepared: Prepared, saved: number): number {
  if (!Number.isSafeInteger(saved) || saved <= 0) return 0;
  return Math.min(saved, keptSavings(prepared.inputs.accounts));
}

export function saveForItReadyDate(prepared: Prepared, check: CheckV2, saved: number): LocalDate | null {
  const r = judgeCheckWith(prepared, check, { savedFor: savedCounted(prepared, saved) }).result;
  if (r.code === 'fits_month' || r.code === 'fits_unspent' || r.code === 'fits_by_borrowing') return r.purchaseDate;
  if (r.code !== 'not_yet' || r.readyBy === null) return null;
  if (r.readyBy.kind === 'date') return r.readyBy.date;
  return addDays(`${addYearMonths(r.readyBy.month, 1)}-01`, -1);
}
