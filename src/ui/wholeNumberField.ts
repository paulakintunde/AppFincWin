/**
 * 05-61 (D-71); moved from features/decide/snapshot/customValues.ts in 05.4-39 (D-155): the pure, digit-only parsing behind
 * a whole-number custom field (CustomValueChips). No money and no engine here; the money bounds stay with Decide.
 */
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
