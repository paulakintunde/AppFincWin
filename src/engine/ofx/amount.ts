/**
 * OFX amount reading (D-39, D-43, D-24; RESEARCH §A1 "Amounts").
 *
 * The spec is a signed decimal with `.` as the mark, but real files vary:
 * some send `,`, some add a leading `+`, some pad to four decimal places.
 * OFX never uses digit grouping, so a grouping character of either kind
 * appearing alongside a genuine decimal mark is rejected outright rather
 * than guessed at. The actual digit-to-`MinorUnits` conversion, including
 * the "strip excess trailing zeros, never round a non-zero excess" rule, is
 * `parseNotatedAmount`'s job -- this module only decides which of `.`/`,` is
 * this cell's decimal mark before handing off.
 */
import { parseNotatedAmount, type NotatedAmountResult, type NumberNotation } from '../money';

function isAllowedChar(ch: string): boolean {
  return (ch >= '0' && ch <= '9') || ch === '+' || ch === '-' || ch === '.' || ch === ',';
}

export function parseOfxAmount(raw: string, exponent: number): NotatedAmountResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: 'empty' };

  let decimalMarkCount = 0;
  let decimalChar: '.' | ',' | null = null;
  for (const ch of trimmed) {
    if (!isAllowedChar(ch)) return { ok: false, error: 'invalid' };
    if (ch === '.' || ch === ',') {
      decimalMarkCount += 1;
      decimalChar = ch;
    }
  }
  // OFX has no grouping (RESEARCH §A1): a second '.'/',' can only be a
  // grouping character alongside the real decimal mark, which OFX never
  // sends, so two or more is refused rather than guessed at.
  if (decimalMarkCount > 1) return { ok: false, error: 'invalid' };

  const decimal = decimalChar ?? '.';
  const group = decimal === '.' ? ',' : '.';
  const notation: NumberNotation = { decimal, group, grouping: 'western' };

  return parseNotatedAmount(trimmed, notation, exponent);
}
