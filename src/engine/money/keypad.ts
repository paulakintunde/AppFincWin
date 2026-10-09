/**
 * Keypad string reducer (REC-20, UI-SPEC 8, RESEARCH Pitfall 10).
 *
 * applyKey is the only place keypad text changes. The text never holds group
 * separators: digits, at most one decimal separator, at most `exponent`
 * fractional digits, no leading zeros, and never a value past MAX_ABS_AMOUNT_MINOR.
 * CLAUDE.md money rule: the cap check is BigInt over digit strings, never a
 * float parse, so no IEEE-754 rounding can enter an amount.
 */
import { MAX_ABS_AMOUNT_MINOR } from './types';

export type KeypadKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'decimal'
  | 'backspace'
  | 'clear';

export interface KeypadContext {
  /** Currency exponent: 0, 2 or 3 (digits after the decimal mark). */
  exponent: number;
  /** The locale's decimal separator, e.g. '.' or ','. */
  decimalSeparator: string;
  /** Optional lower cap on the minor-unit magnitude; defaults to MAX_ABS_AMOUNT_MINOR. */
  maxMinor?: number;
}

function exceedsCap(candidate: string, ctx: KeypadContext): boolean {
  const parts = candidate.split(ctx.decimalSeparator);
  const whole = parts[0] as string;
  const frac = parts[1] ?? '';
  const minor = BigInt(whole + frac.padEnd(ctx.exponent, '0'));
  return minor > BigInt(ctx.maxMinor ?? MAX_ABS_AMOUNT_MINOR);
}

export function applyKey(text: string, key: KeypadKey, ctx: KeypadContext): string {
  const sep = ctx.decimalSeparator;
  if (key === 'clear') return '';
  if (key === 'backspace') {
    return text.endsWith(sep) ? text.slice(0, -sep.length) : text.slice(0, -1);
  }
  if (key === 'decimal') {
    if (ctx.exponent === 0 || text.includes(sep)) return text;
    return text === '' ? `0${sep}` : text + sep;
  }
  const at = text.indexOf(sep);
  if (at >= 0 && text.length - at - sep.length >= ctx.exponent) return text;
  const candidate = text === '0' ? key : text + key;
  return exceedsCap(candidate, ctx) ? text : candidate;
}
