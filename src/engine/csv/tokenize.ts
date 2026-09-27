/**
 * RFC-4180 CSV tokenizer with delimiter detection and the D-18 row ceiling
 * (D-11, D-17, RESEARCH A3 hand-roll decision). This is the one place a
 * statement's already-decoded text (`decodeText`, plan 02-32) becomes a
 * matrix of cell strings -- a single linear character scan, no third-party
 * parser, no regex over cell content, so a hostile or malformed file costs
 * O(n) and a malformed quote never triggers backtracking.
 *
 * A quote is only ever legal at the very start of a field (opening it) or,
 * once inside a quoted field, as a doubled `""` (a literal quote) or a
 * closing quote immediately followed by the delimiter, a line ending, or
 * end of input. Any other quote placement is a typed error carrying the
 * physical line the offending row started on -- never a partial recovery,
 * and never the raw cell content (a line number only, per the threat
 * register's information-disclosure mitigation).
 */

export type Delimiter = ',' | ';' | '\t';

// D-18: a file whose data rows exceed this ceiling is refused with a typed
// error rather than parsed, so the preview and commit stay responsive on
// the reference iPhone XR.
export const MAX_IMPORT_ROWS = 5000;

export type TokenizeError = 'empty' | 'unterminated-quote' | 'stray-quote' | 'too-many-rows';

export type TokenizeResult =
  | { ok: true; rows: string[][]; delimiter: Delimiter }
  | { ok: false; error: TokenizeError; line: number };

const BOM = '﻿';
const DELIMITER_ORDER: readonly Delimiter[] = [',', ';', '\t'];

function stripBom(text: string): string {
  return text.length > 0 && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Counts each candidate delimiter's occurrences outside quotes on the first
 * logical line only, and returns the most frequent -- ties favour ',' then
 * ';' then '\t', and a line with none of them also defaults to ','.
 */
export function detectDelimiter(text: string): Delimiter {
  const s = stripBom(text);
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < s.length && s[i + 1] === '"') {
          i += 1;
          continue;
        }
        inQuotes = false;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === '\n' || ch === '\r') break;
    if (ch === ',' || ch === ';' || ch === '\t') {
      counts[ch] += 1;
    }
  }

  let best: Delimiter = ',';
  let bestCount = -1;
  for (const d of DELIMITER_ORDER) {
    if (counts[d] > bestCount) {
      bestCount = counts[d];
      best = d;
    }
  }
  return best;
}

function isRowBlank(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}

export function tokenize(
  text: string,
  opts?: { delimiter?: Delimiter; maxDataRows?: number }
): TokenizeResult {
  const s = stripBom(text);
  if (s.trim() === '') return { ok: false, error: 'empty', line: 0 };

  const delimiter = opts?.delimiter ?? detectDelimiter(s);
  const maxDataRows = opts?.maxDataRows ?? MAX_IMPORT_ROWS;

  const rows: string[][] = [];
  let headerLength: number | null = null;
  let dataRowCount = 0;

  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let rowStartLine = 1;

  const n = s.length;
  let i = 0;

  function finishRow(): { ok: false; error: TokenizeError; line: number } | null {
    row.push(field);
    field = '';
    const finished = row;
    row = [];

    if (isRowBlank(finished)) return null;

    if (headerLength === null) {
      headerLength = finished.length;
      rows.push(finished);
      return null;
    }

    dataRowCount += 1;
    if (dataRowCount > maxDataRows) {
      return { ok: false, error: 'too-many-rows', line: rowStartLine };
    }

    if (finished.length < headerLength) {
      const padded = finished.slice();
      while (padded.length < headerLength) padded.push('');
      rows.push(padded);
    } else {
      rows.push(finished);
    }
    return null;
  }

  while (i < n) {
    const ch = s[i] as string;

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        const next = i + 1 < n ? s[i + 1] : undefined;
        if (next === undefined || next === delimiter || next === '\n' || next === '\r') {
          inQuotes = false;
          i += 1;
          continue;
        }
        return { ok: false, error: 'stray-quote', line: rowStartLine };
      }

      // Any other character, including an embedded CR or LF, is kept
      // verbatim inside a quoted field (RFC-4180). A CRLF pair is kept as
      // one unit so the physical line count does not double-advance.
      if (ch === '\r' && i + 1 < n && s[i + 1] === '\n') {
        field += '\r\n';
        i += 2;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      if (field === '') {
        inQuotes = true;
        i += 1;
        continue;
      }
      return { ok: false, error: 'stray-quote', line: rowStartLine };
    }

    if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      const err = finishRow();
      if (err) return err;
      if (ch === '\r' && i + 1 < n && s[i + 1] === '\n') {
        i += 2;
      } else {
        i += 1;
      }
      rowStartLine += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (inQuotes) {
    return { ok: false, error: 'unterminated-quote', line: rowStartLine };
  }

  if (field !== '' || row.length > 0) {
    const err = finishRow();
    if (err) return err;
  }

  return { ok: true, rows, delimiter };
}
