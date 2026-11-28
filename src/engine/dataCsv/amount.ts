/**
 * 10-review-2 (D-1, D-2; owner 2026-11-28): how an amount cell in a data CSV is read. Supersedes 10-review D-1 (whole
 * minor units only). Amounts are normal money amounts ("2500" is 2,500.00 in the row's currency); cents are used only for
 * an older FincWin export or a file whose amount_format column says 'minor' (see parse.ts).
 *
 * Reading a cell, before any file context (shapeCell):
 *  - Currency symbols and codes before or after the number are dropped, and so are spaces, NBSP and apostrophes used
 *    as grouping. Parentheses, or a leading or trailing minus, mean negative.
 *  - Both ',' and '.': the LAST one is the decimal mark, the other is grouping (groups of 3).
 *  - One kind, more than once ("1,234,567"): grouping.
 *  - One kind, once, with other than 3 digits after it ("5,69", "5.6", "7."): the decimal mark.
 *  - One kind, once, with exactly 3 digits after it ("1,234"): ambiguous; resolveCell settles it with the file's context.
 * Pure string work: no float parsing, no rounding. No imports from db/, state/, services/, ui/ or react.
 */
import { MAX_ABS_AMOUNT_MINOR, currencyExponent, knownCurrencyExponent, toDecimalString, type KnownCustomCurrency, type MinorUnits } from '../money';

export type Mark = ',' | '.';

/** A cell read on its own. `proves` is the decimal mark the cell shows beyond doubt, when it shows one. */
export type CellShape =
  | { kind: 'bad' }
  | { kind: 'sure'; negative: boolean; whole: string; fraction: string; proves: Mark | null }
  | { kind: 'ambiguous'; negative: boolean; mark: Mark; left: string; right: string };

const EDGE = /^[\p{L}\p{Sc}\s]+|[\p{L}\p{Sc}\s]+$/gu;
const MINUS = /^[-−]|[-−]$/;
const INNER_GROUPING = /[\s'’]/gu;
const BODY = /^[0-9.,]*[0-9][0-9.,]*$/;

const other = (m: Mark): Mark => (m === ',' ? '.' : ',');

/** "1,234,567" style: a first group of 1-3 digits not led by 0, then groups of exactly 3. */
function validGroups(text: string, group: Mark): boolean {
  const parts = text.split(group);
  const first = parts[0] as string;
  if (!/^[1-9]\d{0,2}$/.test(first)) return false;
  return parts.slice(1).every((p) => /^\d{3}$/.test(p));
}

function stripSign(raw: string): { negative: boolean; body: string } | null {
  let s = raw.replace(EDGE, '');
  let negative = false;
  for (;;) {
    const paren = /^\((.*)\)$/s.exec(s);
    const minus = paren ? null : MINUS.exec(s);
    if (!paren && !minus) break;
    if (negative) return null; // two signs: "-(5)" is not something a person writes
    negative = true;
    s = paren ? (paren[1] as string) : s.startsWith('-') || s.startsWith('−') ? s.slice(1) : s.slice(0, -1);
    s = s.replace(EDGE, '');
  }
  if (s.startsWith('+')) s = s.slice(1).replace(EDGE, '');
  return { negative, body: s.replace(INNER_GROUPING, '') };
}

export function shapeCell(raw: string): CellShape {
  const signed = stripSign(raw.trim());
  if (signed === null || !BODY.test(signed.body)) return { kind: 'bad' };
  const { negative, body } = signed;
  const commas = body.split(',').length - 1;
  const dots = body.split('.').length - 1;
  if (commas === 0 && dots === 0) return { kind: 'sure', negative, whole: body, fraction: '', proves: null };

  if (commas > 0 && dots > 0) {
    const decimal: Mark = body.lastIndexOf(',') > body.lastIndexOf('.') ? ',' : '.';
    const [left, right, ...rest] = body.split(decimal) as [string, string, ...string[]];
    if (rest.length > 0 || !validGroups(left, other(decimal))) return { kind: 'bad' };
    return { kind: 'sure', negative, whole: left.split(other(decimal)).join(''), fraction: right, proves: decimal };
  }

  const mark: Mark = commas > 0 ? ',' : '.';
  if (commas + dots > 1) {
    if (!validGroups(body, mark)) return { kind: 'bad' };
    return { kind: 'sure', negative, whole: body.split(mark).join(''), fraction: '', proves: other(mark) };
  }
  const [left, right] = body.split(mark) as [string, string];
  if (right.length === 3 && validGroups(left, mark)) return { kind: 'ambiguous', negative, mark, left, right };
  return { kind: 'sure', negative, whole: left, fraction: right, proves: mark };
}

/** What settled an ambiguous cell. 'guess' means nothing did: grouping was taken and the row says how it was read. */
export type Resolution = 'convention' | 'exponent' | 'device' | 'guess';

export interface ResolveContext {
  /** The decimal mark the rest of the column (or file) proves, when it proves one. */
  convention: Mark | null;
  exponent: number;
  /** The device's decimal mark (src/services/locale), passed in so this stays pure. */
  deviceDecimal?: string;
}

export type ResolvedCell =
  | { ok: true; negative: boolean; whole: string; fraction: string; resolution: Resolution | null }
  | { ok: false };

/** Settles an ambiguous "1,234" in this order: the file's proven convention, the currency's decimals, the device's mark. */
export function resolveCell(shape: CellShape, ctx: ResolveContext): ResolvedCell {
  if (shape.kind === 'bad') return { ok: false };
  if (shape.kind === 'sure') return { ok: true, negative: shape.negative, whole: shape.whole, fraction: shape.fraction, resolution: null };
  const asDecimal = (resolution: Resolution): ResolvedCell => ({ ok: true, negative: shape.negative, whole: shape.left, fraction: shape.right, resolution });
  const asGrouping = (resolution: Resolution): ResolvedCell => ({ ok: true, negative: shape.negative, whole: `${shape.left}${shape.right}`, fraction: '', resolution });
  if (ctx.convention !== null) return ctx.convention === shape.mark ? asDecimal('convention') : asGrouping('convention');
  if (ctx.exponent < 3) return asGrouping('exponent');
  if (ctx.deviceDecimal === ',' || ctx.deviceDecimal === '.') {
    return ctx.deviceDecimal === shape.mark ? asDecimal('device') : asGrouping('device');
  }
  return asGrouping('guess');
}

export type MinorOutcome = { minor: number } | { issue: 'bad-amount' | 'extra-decimals' };

/** Whole and fraction digits to integer minor units. Never rounds: extra decimals are an issue, not a rounding. */
export function toMinor(negative: boolean, whole: string, fraction: string, exponent: number): MinorOutcome {
  // Zeros past the currency's decimals change nothing ("2500.00" yen is exactly 2500), so they are dropped, not rounded.
  if (fraction.length > exponent && /[1-9]/.test(fraction.slice(exponent))) return { issue: 'extra-decimals' };
  const kept = fraction.slice(0, exponent);
  const digits = `${whole}${kept.padEnd(exponent, '0')}`.replace(/^0+(?=\d)/, '');
  if (digits.length > 16 || BigInt(digits) > BigInt(MAX_ABS_AMOUNT_MINOR)) return { issue: 'bad-amount' };
  const n = Number(digits);
  return { minor: negative && n !== 0 ? -n : n };
}

/** A currency's decimals: built-in ISO, else the person's own custom currency, else the ISO default rule. */
export function exponentWith(customs: readonly KnownCustomCurrency[] = []): (code: string) => number {
  return (code) => knownCurrencyExponent(code, customs) ?? currencyExponent(code);
}

/** The canonical export form: dot decimal, the currency's own decimals, no grouping, a hyphen minus. */
export function formatExportAmount(minor: number, exponent: number): string {
  return toDecimalString(minor as MinorUnits, exponent);
}
