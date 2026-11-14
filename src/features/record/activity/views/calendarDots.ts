/**
 * 06.2-12 (L03, DSG-07): the calendar's spend-sized dots. A day's dot grows with what was spent that day in three sizes
 * (under 50, 50 to 200, over 200 in the home currency's major units), always in the existing dot colour, so size never
 * adds a colour and the band is also spoken. Integer minor units only: the thresholds are whole major units times the
 * currency's minor-per-major, compared as integers.
 */
import type { ActivityRowView } from '@/data/queries/activity';
import { isUnpaidBill } from '@/engine/activity';
import { currencyExponent } from '@/engine/money';

export type DotBand = 'none' | 'small' | 'medium' | 'large';

/** The band edges in whole major units (L03 legend: under 50, 50 to 200, over 200). */
export const BAND_LOW_MAJOR = 50;
export const BAND_HIGH_MAJOR = 200;

/** Dot diameters per band; 'none' draws no dot. */
export const DOT_DIAMETER: Readonly<Record<Exclude<DotBand, 'none'>, number>> = Object.freeze({ small: 4, medium: 6, large: 9 });

/** Minor units in one major unit of a currency (100 for GBP, 1 for JPY). */
export function minorPerMajorOf(currency: string): number {
  return 10 ** currencyExponent(currency);
}

/**
 * The size band for a day's spending. `spentMinor` is a non-negative integer of minor units; nothing spent is 'none'.
 * Under 50 is small, 50 to 200 (both ends included) is medium, over 200 is large.
 */
export function dotBand(spentMinor: number, minorPerMajor: number): DotBand {
  if (!Number.isSafeInteger(spentMinor) || !Number.isSafeInteger(minorPerMajor) || minorPerMajor <= 0) return 'none';
  if (spentMinor <= 0) return 'none';
  if (spentMinor < BAND_LOW_MAJOR * minorPerMajor) return 'small';
  if (spentMinor <= BAND_HIGH_MAJOR * minorPerMajor) return 'medium';
  return 'large';
}

/** A line the calendar counts, as the engine's day net does: not a transfer leg and not skipped. */
function counts(row: ActivityRowView): boolean {
  return row.transfer_id === null && row.status !== 'skipped';
}

/** What went out on a day in home minor units: the sum of outgoing counted lines (money in does not offset it). */
export function daySpentMinor(rows: readonly ActivityRowView[]): number {
  let spent = 0;
  for (const row of rows) {
    if (!counts(row) || row.amountHome === null || row.amountHome >= 0) continue;
    spent += -row.amountHome;
  }
  return spent;
}

/** True when a day carries an unpaid bill (a pending outgoing line), which shows the slate clock. */
export function dayHasBillDue(rows: readonly ActivityRowView[]): boolean {
  return rows.some((row) => isUnpaidBill(row));
}
