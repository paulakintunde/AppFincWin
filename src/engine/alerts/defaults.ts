/**
 * Default alert amounts (Phase 10 D-10). Pure: integer minor units, BigInt
 * maths, half-up rounding through the money core. The server never computes
 * these; the Alerts screen saves the explicit numbers and the server compares.
 */
import {
  convertMinor,
  divideHalfUp,
  minorUnits,
  parseRate,
  type MinorUnits,
  type ScaledRate,
} from '../money';

export const ALERT_HISTORY_MIN_EXPENSES = 30;
export const ALERT_HISTORY_MIN_MONTHS = 2;
/** 200.00 EUR */
export const FLAT_LARGE_EUR_MINOR = 20000;
/** 100.00 EUR */
export const FLAT_LOW_EUR_MINOR = 10000;

/** Weeks in the 3-month window (13 weeks): low balance is about one week of spending. */
const WEEKS_IN_WINDOW = 13n;
const LARGE_MULTIPLE = 3n;
const EUR_EXPONENT = 2;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface AlertSpendLine {
  magnitude: MinorUnits;
  /** YYYY-MM-DD, the person's local date. Expenses only, home currency. */
  localDate: string;
}

export interface SuggestInput {
  expenses: readonly AlertSpendLine[];
  /** YYYY-MM-DD, the person's local date. */
  today: string;
  homeCurrency: string;
  homeExponent: number;
  homePerEur: ScaledRate | null;
}

export interface SuggestedAmount {
  minor: MinorUnits;
  basis: 'history' | 'flat';
}

export interface SuggestedAmounts {
  large: SuggestedAmount;
  low: SuggestedAmount;
}

function toSafe(n: bigint): MinorUnits {
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('suggestAlertAmounts: result exceeds Number.MAX_SAFE_INTEGER');
  }
  return minorUnits(Number(n));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Same day three calendar months earlier, clamped to the month length. */
function windowStartExclusive(today: string): string {
  const m = DATE_PATTERN.exec(today);
  if (!m) {
    throw new RangeError(`suggestAlertAmounts: "${today}" is not a YYYY-MM-DD date`);
  }
  let year = Number(m[1]);
  let month = Number(m[2]) - 3;
  const day = Number(m[3]);
  if (month < 1) {
    month += 12;
    year -= 1;
  }
  const d = Math.min(day, daysInMonth(year, month));
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function flatAmount(eurMinor: number, input: SuggestInput): SuggestedAmount {
  const exp = input.homeExponent;
  let converted: bigint;
  if (input.homePerEur === null) {
    // No rate known: treat the flat figure as whole units of the home currency.
    converted = BigInt(eurMinor / 10 ** EUR_EXPONENT) * 10n ** BigInt(exp);
  } else {
    converted = BigInt(
      convertMinor(minorUnits(eurMinor), parseRate('1'), EUR_EXPONENT, input.homePerEur, exp)
    );
  }
  const unit = 10n ** BigInt(exp);
  let whole = divideHalfUp(converted, unit) * unit;
  if (whole < unit) {
    whole = unit; // never suggest zero
  }
  return { minor: toSafe(whole), basis: 'flat' };
}

export function suggestAlertAmounts(input: SuggestInput): SuggestedAmounts {
  const start = windowStartExclusive(input.today);
  const inWindow = input.expenses.filter((e) => e.localDate > start && e.localDate <= input.today);
  const months = new Set(inWindow.map((e) => e.localDate.slice(0, 7)));

  if (inWindow.length < ALERT_HISTORY_MIN_EXPENSES || months.size < ALERT_HISTORY_MIN_MONTHS) {
    return {
      large: flatAmount(FLAT_LARGE_EUR_MINOR, input),
      low: flatAmount(FLAT_LOW_EUR_MINOR, input),
    };
  }

  const sorted = inWindow.map((e) => BigInt(e.magnitude)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1 ? sorted[mid]! : divideHalfUp(sorted[mid - 1]! + sorted[mid]!, 2n);
  const total = sorted.reduce((a, b) => a + b, 0n);
  const lowRaw = divideHalfUp(total, WEEKS_IN_WINDOW);

  return {
    large: { minor: toSafe(median * LARGE_MULTIPLE), basis: 'history' },
    low: { minor: toSafe(lowRaw < 1n ? 1n : lowRaw), basis: 'history' },
  };
}
