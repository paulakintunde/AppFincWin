/**
 * Recurring-series maths for the verdict: monthly equivalents (D-23), bills due within 90 days (D-24) and dated
 * scheduled outflows (D-61).
 *
 * Imports schedule.ts directly and never the `../recurring` barrel, which also exports detect.ts suggestions: an
 * unconfirmed suggestion must never reach a verdict (D-25).
 */
import { assertNever } from '../guards/assertNever';
import { divideHalfUp } from '../money/rounding';
import type { MinorUnits } from '../money/types';
import { minorFromBigInt } from '../payoff/types';
import { isRecurringFreq, occurrencesBetween, type RecurringFreq } from '../recurring/schedule';
import { isValidLocalDate } from '../time/localDate';
import { FORTNIGHTS_PER_YEAR, MONTHS_PER_QUARTER, MONTHS_PER_YEAR, WEEKS_PER_YEAR } from './constants';
import type { BillDue, RecurringBill, ScheduledOutflow, ScheduledOutflowsDue } from './types';

/**
 * Monthly equivalent of a series amount with integer maths and ONE half-up rounding (D-23, D-20):
 * weekly x 52 / 12, fortnightly x 26 / 12, quarterly / 3, yearly / 12, monthly unchanged.
 */
export function monthlyEquivalent(amount: MinorUnits, freq: RecurringFreq): MinorUnits {
  const a = BigInt(amount);
  switch (freq) {
    case 'weekly':
      return minorFromBigInt(divideHalfUp(a * BigInt(WEEKS_PER_YEAR), BigInt(MONTHS_PER_YEAR)), 'monthlyEquivalent');
    case 'fortnightly':
      return minorFromBigInt(
        divideHalfUp(a * BigInt(FORTNIGHTS_PER_YEAR), BigInt(MONTHS_PER_YEAR)),
        'monthlyEquivalent'
      );
    case 'monthly':
      return amount;
    case 'quarterly':
      return minorFromBigInt(divideHalfUp(a, BigInt(MONTHS_PER_QUARTER)), 'monthlyEquivalent');
    case 'yearly':
      return minorFromBigInt(divideHalfUp(a, BigInt(MONTHS_PER_YEAR)), 'monthlyEquivalent');
    default:
      return assertNever(freq, 'freq');
  }
}

/** D-23: every non-monthly bill is replaced by its monthly equivalent. */
export function isSmoothedFreq(freq: RecurringFreq): boolean {
  return freq !== 'monthly';
}

/** D-60: confirmed weekly and fortnightly pay is smoothed in the income averages (04-13 uses monthlyEquivalent). */
export function isSmoothedPayFreq(freq: RecurringFreq): boolean {
  return freq === 'weekly' || freq === 'fortnightly';
}

/** D-24: only quarterly and yearly bills are deducted ahead; monthly-or-more-frequent ones are covered by the month test. */
export function isDeductedAheadFreq(freq: RecurringFreq): boolean {
  return freq === 'quarterly' || freq === 'yearly';
}

/** Guard shared by bills and income series (D-44): a series without a category. */
export function assertValidBill(bill: Omit<RecurringBill, 'categoryId'>, fn: string): void {
  if (!isRecurringFreq(bill.freq)) {
    throw new RangeError(`${fn}: series ${bill.seriesId} has invalid frequency "${String(bill.freq)}"`);
  }
  if (!isValidLocalDate(bill.anchorDate)) {
    throw new RangeError(`${fn}: series ${bill.seriesId} has invalid anchorDate "${bill.anchorDate}"`);
  }
  if (bill.endDate !== null && !isValidLocalDate(bill.endDate)) {
    throw new RangeError(`${fn}: series ${bill.seriesId} has invalid endDate "${bill.endDate}"`);
  }
  if (bill.lastPaidDate !== null && !isValidLocalDate(bill.lastPaidDate)) {
    throw new RangeError(`${fn}: series ${bill.seriesId} has invalid lastPaidDate "${bill.lastPaidDate}"`);
  }
  if (!Number.isSafeInteger(bill.latestAmount) || bill.latestAmount < 0) {
    throw new RangeError(`${fn}: series ${bill.seriesId} latestAmount must be a non-negative integer`);
  }
  if (bill.occurrenceCount !== null && (!Number.isSafeInteger(bill.occurrenceCount) || bill.occurrenceCount <= 0)) {
    throw new RangeError(`${fn}: series ${bill.seriesId} occurrenceCount must be null or a positive integer`);
  }
}

/**
 * 'YYYY-MM-DD' plus a whole number of days. Exported so the D-44 cash path (04-17) shares this plan's definition of
 * "within 90 days".
 */
export function addDays(date: string, days: number): string {
  if (!isValidLocalDate(date)) {
    throw new RangeError(`addDays: "${date}" is not a valid local date`);
  }
  if (!Number.isSafeInteger(days) || days < 0) {
    throw new RangeError(`addDays: days must be a non-negative integer, got ${days}`);
  }
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return `${String(dt.getUTCFullYear()).padStart(4, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * The next scheduled occurrence after the last settled one (D-24), or the anchor when none has been settled; null once
 * the series has ended.
 */
export function nextDueDate(bill: Omit<RecurringBill, 'categoryId'>): string | null {
  assertValidBill(bill, 'nextDueDate');
  const from = bill.lastPaidDate === null ? bill.anchorDate : addDays(bill.lastPaidDate, 1);
  // 400 days exceeds the longest gap between occurrences (a leap-year yearly step of 366 days).
  const found = occurrencesBetween(
    {
      anchorDate: bill.anchorDate,
      freq: bill.freq,
      endDate: bill.endDate,
      occurrenceCount: bill.occurrenceCount,
    },
    from,
    addDays(from, 400)
  )[0];
  return found?.date ?? null;
}

function assertWindow(asOf: string, horizonDays: number, fn: string): void {
  if (!isValidLocalDate(asOf)) {
    throw new RangeError(`${fn}: asOf "${asOf}" is not a valid local date`);
  }
  if (!Number.isSafeInteger(horizonDays) || horizonDays < 0) {
    throw new RangeError(`${fn}: horizonDays must be a non-negative integer, got ${horizonDays}`);
  }
}

/**
 * Confirmed quarterly and yearly bills with occurrences owed between the first day of the check's month and
 * `horizonDays` after the check date (D-24; BILLS_DUE_HORIZON_DAYS is the usual horizon).
 *
 * An occurrence counts when it is after the last settled date, so a bill paid this cycle is not deducted. An unpaid
 * occurrence earlier in the check's own month is still owed; earlier months are full history (D-10, D-28) and are never
 * re-deducted. Unconfirmed series (D-25) and monthly-or-more-frequent ones are never returned. The amount is the latest
 * scheduled amount (D-26). Amounts are household amounts; prepareContext (04-07) applies my existing-spending share (D-34).
 */
export function billsDueWithin(bills: readonly RecurringBill[], asOf: string, horizonDays: number): readonly BillDue[] {
  assertWindow(asOf, horizonDays, 'billsDueWithin');
  const windowStart = `${asOf.slice(0, 7)}-01`;
  const windowEnd = addDays(asOf, horizonDays);
  const due: BillDue[] = [];
  for (const bill of bills) {
    assertValidBill(bill, 'billsDueWithin');
    if (!bill.confirmed || !isDeductedAheadFreq(bill.freq)) continue;
    const dates = occurrencesBetween(
      {
        anchorDate: bill.anchorDate,
        freq: bill.freq,
        endDate: bill.endDate,
        occurrenceCount: bill.occurrenceCount,
      },
      windowStart,
      windowEnd
    )
      .map((o) => o.date)
      .filter((d) => bill.lastPaidDate === null || d > bill.lastPaidDate);
    if (dates.length === 0) continue;
    due.push({
      seriesId: bill.seriesId,
      categoryId: bill.categoryId,
      dates,
      amount: minorFromBigInt(BigInt(bill.latestAmount) * BigInt(dates.length), 'billsDueWithin'),
    });
  }
  return due;
}

/**
 * Dated pending one-off outflows (D-61). Each lands once, inside the one 90-day window: dated on or before asOf it is
 * `dueNow` and sits on day 0 of the D-44 cash path; dated after asOf and within the horizon it is `dueAhead` and sits on
 * its own date; later ones are left out. The amount is already MY share (resolved by the snapshot builder) so no split is
 * applied here, and there is no currency check here (prepareContext and the cash path run assertCurrency per outflow).
 *
 * `dueNow` reduces the cash ledger (the `cash` check and the D-38 Cash row), with or without a cash path; spare money
 * (cashAfterBills) deducts `dueNow` and `dueAhead`. 04-07 applies that reading (04-REPLAN-NOTES D-61).
 */
export function scheduledOutflowsDue(
  outflows: readonly ScheduledOutflow[],
  asOf: string,
  horizonDays: number
): ScheduledOutflowsDue {
  assertWindow(asOf, horizonDays, 'scheduledOutflowsDue');
  const windowEnd = addDays(asOf, horizonDays);
  let dueNow = 0n;
  let dueAhead = 0n;
  const dated: { date: string; amount: MinorUnits }[] = [];
  for (const o of outflows) {
    if (!isValidLocalDate(o.date)) {
      throw new RangeError(`scheduledOutflowsDue: outflow ${o.id} has invalid date "${o.date}"`);
    }
    if (!Number.isSafeInteger(o.amount) || o.amount <= 0) {
      throw new RangeError(`scheduledOutflowsDue: outflow ${o.id} amount must be a positive integer`);
    }
    if (o.date <= asOf) {
      dueNow += BigInt(o.amount);
      dated.push({ date: asOf, amount: o.amount });
    } else if (o.date <= windowEnd) {
      dueAhead += BigInt(o.amount);
      dated.push({ date: o.date, amount: o.amount });
    }
  }
  return {
    dueNow: minorFromBigInt(dueNow, 'scheduledOutflowsDue'),
    dueAhead: minorFromBigInt(dueAhead, 'scheduledOutflowsDue'),
    dated,
  };
}
