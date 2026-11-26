// 10.1-15 (SCN-02): printed prices into integer minor units. Pure string and integer work; never floats.

const SYMBOLS = /[$£€¥]/g;
const LOOSE_SIGN = /^[-$£€¥]$/;
const SYMBOL_ONLY = /^[$£€¥]+$/;
const MAX_DIGITS = 13;

function unsign(token: string): { body: string; negative: boolean } {
  const s = token.replace(SYMBOLS, '').replace(/\s+/g, '');
  if (s.startsWith('(') && s.endsWith(')')) return { body: s.slice(1, -1), negative: true };
  if (s.startsWith('-')) return { body: s.slice(1), negative: true };
  if (s.endsWith('-')) return { body: s.slice(0, -1), negative: true };
  return { body: s, negative: false };
}

function magnitude(s: string, exponent: number): number | null {
  if (!/^\d(?:[\d.,]*\d)?$/.test(s)) return null;
  let whole = s;
  let frac = '';
  if (exponent > 0) {
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    if (last < 0) return null;
    frac = s.slice(last + 1);
    whole = s.slice(0, last);
    // '12.505' and '1.234' (thousands or decimals?) are not taken.
    if (frac.length !== exponent || whole.includes(s.charAt(last))) return null;
  }
  const seps = whole.match(/[.,]/g) ?? [];
  if (new Set(seps).size > 1) return null;
  const groups = whole.split(/[.,]/);
  if (groups.length > 1 && (!/^\d{1,3}$/.test(groups[0] as string) || groups.slice(1).some((g) => !/^\d{3}$/.test(g)))) return null;
  const digits = groups.join('') + frac;
  if (digits.length > MAX_DIGITS) return null;
  return parseInt(digits, 10);
}

/** A printed price token in minor units (negative for '-2.50', '2.50-' or '(2.50)'); null when it is not a price or the grouping is ambiguous. */
export function parsePriceToMinor(token: string, exponent: number): number | null {
  const { body, negative } = unsign(token);
  const m = magnitude(body, exponent);
  if (m === null) return null;
  return negative ? -m : m;
}

export interface RowPrice { amount: number; negative: boolean; token: string; ambiguous: boolean }

function asPrice(token: string, exponent: number, ambiguous: boolean, printed: string): RowPrice | null {
  const v = parsePriceToMinor(token, exponent);
  if (v === null) return null;
  return { amount: Math.abs(v), negative: v < 0, token: printed, ambiguous };
}

/**
 * The price printed at the end of a row (a trailing currency symbol is skipped). `token` is the price as printed in
 * the row. A letter O read for a zero, a dash read for the decimal point, or a decimal split by a space, is repaired
 * and marked ambiguous.
 */
export function rowPrice(text: string, exponent: number): RowPrice | null {
  const toks = text.split(/\s+/).filter((t) => t !== '');
  while (toks.length > 0 && SYMBOL_ONLY.test(toks[toks.length - 1] as string)) toks.pop();
  let token = toks.pop();
  if (token === undefined) return null;
  let printed = token;
  while (toks.length > 0 && LOOSE_SIGN.test(toks[toks.length - 1] as string)) {
    const sign = toks.pop() as string;
    token = `${sign}${token}`;
    printed = `${sign} ${printed}`;
  }
  const strict = asPrice(token, exponent, false, printed);
  if (strict) return strict;
  // OCR slips: a letter O for a zero, a dash for the decimal point ('40-00').
  if (/[Oo]|\d-\d/.test(token)) {
    const repaired = asPrice(token.replace(/[Oo]/g, '0').replace(/(\d)-(\d+)$/, '$1.$2'), exponent, true, printed);
    if (repaired) return repaired;
  }
  const prev = toks[toks.length - 1];
  if (prev !== undefined && (/^[.,]\d+$/.test(token) || (/[.,]$/.test(prev) && /^\d+$/.test(token)))) {
    return asPrice(`${prev}${token}`, exponent, true, `${prev} ${printed}`);
  }
  return null;
}
