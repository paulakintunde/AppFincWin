/**
 * 05-61 (D-71, D-83): the pure bounds behind the Custom chips and the typed slider fields.
 *
 * Money is integer minor units. Division goes through the engine's bigint ceilDivide / divideHalfUp and converts back
 * with minorFromBigInt, so no float ever divides a money value. Percentages shown beside a slider are display only.
 */
import { ceilDivide, minorFromBigInt } from '@/engine/payoff';
import { divideHalfUp, type MinorUnits } from '@/engine/money';

export const DURATION_MIN = 1;
export const DURATION_MAX = 120;
export const HORIZON_MAX = 600;
/** D-83: the cheaper price runs from this share of the advertised price up to the price. */
export const CHEAPER_MIN_PERCENT = 30;

export type WholeParse =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'out_of_range' }
  | { kind: 'ok'; value: number };

const DIGITS = /^\d+$/;
const DIGITS_OR_EMPTY = /^\d*$/;

/** Whole digits only, within [min, max]. A decimal mark or any other character is invalid. */
export function parseWholeInRange(text: string, min: number, max: number): WholeParse {
  if (text === '') return { kind: 'empty' };
  if (!DIGITS.test(text)) return { kind: 'invalid' };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < min || value > max) return { kind: 'out_of_range' };
  return { kind: 'ok', value };
}

/** The months field refuses anything but digits at the keystroke (a decimal mark never lands). */
export function acceptsMonthsKeystroke(text: string): boolean {
  return DIGITS_OR_EMPTY.test(text);
}

/** The preset equal to `value`, else null. */
export function presetFor<T extends number>(value: number | null, presets: readonly T[]): T | null {
  if (value === null) return null;
  return presets.find((p) => p === value) ?? null;
}

/** Target over `months`, rounded up to the cent. */
export function waitAmountForMonths(target: number, months: number): MinorUnits {
  if (!Number.isInteger(months) || months < DURATION_MIN || months > DURATION_MAX) {
    throw new RangeError(`waitAmountForMonths: months must be a whole number from ${DURATION_MIN} to ${DURATION_MAX}`);
  }
  return minorFromBigInt(ceilDivide(BigInt(target), BigInt(months)), 'waitAmountForMonths');
}

/** Months to reach the target at `amount` a month: ceil(target / amount). Null when the amount is not above zero. */
export function waitMonthsFor(target: number, amount: number): number | null {
  if (amount <= 0) return null;
  return Number(ceilDivide(BigInt(target), BigInt(amount)));
}

/** The typed Wait amount runs from ceil(target / 120) to the target. */
export function waitTypedBounds(target: number): { min: MinorUnits; max: MinorUnits } {
  return {
    min: minorFromBigInt(ceilDivide(BigInt(target), BigInt(DURATION_MAX)), 'waitTypedBounds'),
    max: minorFromBigInt(BigInt(target), 'waitTypedBounds'),
  };
}

/** The Wait slider: tops out at min(2 x max(spare, step), target), floored at 0; the bottom is one step or the top. */
export function waitSliderBounds(target: number, spare: number, step: number): { min: MinorUnits; max: MinorUnits } {
  const base = BigInt(spare) > BigInt(step) ? BigInt(spare) : BigInt(step);
  const double = base * 2n;
  const cap = BigInt(target);
  const top = double < cap ? double : cap;
  const max = top < 0n ? 0n : top;
  const stepBig = BigInt(step);
  const min = stepBig < max ? stepBig : max;
  return { min: minorFromBigInt(min, 'waitSliderBounds'), max: minorFromBigInt(max, 'waitSliderBounds') };
}

/** A typed value beyond the track pins the thumb to the end and says which side it is on; the value still applies. */
export function pinToTrack(value: number, min: number, max: number): { thumb: number; beyond: 'above' | 'below' | null } {
  if (value > max) return { thumb: max, beyond: 'above' };
  if (value < min) return { thumb: min, beyond: 'below' };
  return { thumb: value, beyond: null };
}

/** D-83: from ceil(30% of the advertised price) to the price, in minor units. */
export function cheaperBounds(advertised: number): { min: MinorUnits; max: MinorUnits } {
  const price = BigInt(advertised);
  return {
    min: minorFromBigInt(ceilDivide(price * BigInt(CHEAPER_MIN_PERCENT), 100n), 'cheaperBounds'),
    max: minorFromBigInt(price, 'cheaperBounds'),
  };
}

/** The half-up whole percent of cheaper over advertised, clamped to 30..100. Display only: never converted back. */
export function cheaperThumbPercent(cheaper: number, advertised: number): number {
  if (advertised === 0) return 100;
  const pct = divideHalfUp(BigInt(cheaper) * 100n, BigInt(advertised));
  const low = BigInt(CHEAPER_MIN_PERCENT);
  const clamped = pct < low ? low : pct > 100n ? 100n : pct;
  return Number(clamped);
}
