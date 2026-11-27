/**
 * 09 D-03 / Owner Answer 2: a simple CSV export that works in every plan state (reads stay open when locked).
 * Phase 10 DAT-02 builds the full export screen on this. Pure: no React, no I/O. Money stays integer minor units
 * exactly as stored; nothing here formats an amount as a decimal.
 */

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const INJECTION_LEAD = /^[=+\-@]/;
const ESCAPED_LEAD = /^'+[=+\-@]/;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function escapeCell(value: unknown): string {
  let text = cellText(value);
  // T-09-63: a spreadsheet would run a cell that starts with = + - @ as a formula. A plain number is safe.
  if (INJECTION_LEAD.test(text) && !(typeof value !== 'object' && PLAIN_NUMBER.test(text))) text = `'${text}`;
  // 10-30: text that already starts with ' before = + - @ gets one more, so import's single-apostrophe strip
  // (engine/dataCsv unescapeCell) gives back the original ("'=!" stayed "=!" before; CI property test).
  else if (ESCAPED_LEAD.test(text)) text = `'${text}`;
  const isObject = typeof value === 'object' && value !== null;
  if (isObject || /[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Header row, then one row per record, each line ended by CRLF. */
export function toCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const lines = [columns.map((c) => escapeCell(c)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => escapeCell(row[c])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
