// D-40: one pipeline for every statement format. Adapter -> StatementDraft -> format profile ->
// conversion -> reconciliation -> duplicate check -> transfer detection -> preview -> commit.
// Pure: no React, no I/O. The file's bytes arrive from the device (services/files) and the
// file never leaves it (D-17, D-39). Failures are typed reasons and issue codes only: nothing
// here throws for file content, and no statement text (descriptions, amounts, account numbers)
// is placed in an error, a log or an event (RESEARCH security extension V7).
import {
  detectColumns,
  csvToDraft,
  inferDateFormat,
  inferNumberNotation,
  notationFor,
  tokenize,
  type ColumnMapping,
  type DateFormat,
  type DateFormatGuess,
  type Delimiter,
  type NotationGuess,
} from '@/engine/csv';
import type { NumberNotation } from '@/engine/money';
import { parseOfx } from '@/engine/ofx';
import { decodeText, sniffFormat, type StatementDraft } from '@/engine/statement';

export type RejectReason =
  | 'too_many_rows'
  | 'unreadable'
  | 'no_rows'
  | 'too_big'
  | 'unsupported_format'
  | 'unsupported_statement';

export type ImportFormat = 'csv' | 'ofx' | 'qfx';

export interface PreparedCsv {
  header: string[];
  dataRows: string[][];
  delimiter: Delimiter;
  detected: ColumnMapping;
  confidence: 'high' | 'low';
  dateGuess: DateFormatGuess;
  dateFormat: DateFormat;
  dateAmbiguous: boolean;
  notationGuess: NotationGuess;
  notation: NumberNotation;
  notationAmbiguous: boolean;
}

export type PreparedImport =
  | { format: 'csv'; csv: PreparedCsv }
  | { format: 'ofx' | 'qfx'; statements: StatementDraft[] };

export type PrepareResult = { ok: true; prepared: PreparedImport } | { ok: false; reason: RejectReason };

export interface PrepareRegion {
  decimal: '.' | ',';
  dayFirst: boolean;
}

const COLUMN_SAMPLE_ROWS = 100;

function columnCells(rows: readonly (readonly string[])[], cols: readonly (number | null)[]): string[] {
  const out: string[] = [];
  for (const col of cols) {
    if (col === null) continue;
    for (const row of rows) {
      const cell = row[col];
      if (cell !== undefined && cell.trim() !== '') out.push(cell);
    }
  }
  return out;
}

function regionDateFormat(region: PrepareRegion): DateFormat {
  return region.dayFirst ? 'DMY' : 'MDY';
}

function resolveDateFormat(guess: DateFormatGuess, region: PrepareRegion): { format: DateFormat; ambiguous: boolean } {
  if (guess.kind === 'certain') return { format: guess.format, ambiguous: false };
  const fallback = regionDateFormat(region);
  if (guess.kind === 'ambiguous') {
    // The region's own order when the file allows it; either way the user is asked (E-CR-02).
    return { format: guess.candidates.includes(fallback) ? fallback : (guess.candidates[0] ?? fallback), ambiguous: true };
  }
  return { format: fallback, ambiguous: true };
}

function prepareCsv(text: string, region: PrepareRegion): PrepareResult {
  const tokens = tokenize(text);
  if (!tokens.ok) return { ok: false, reason: tokens.error === 'too-many-rows' ? 'too_many_rows' : 'unreadable' };

  const header = tokens.rows[0];
  const dataRows = tokens.rows.slice(1);
  if (header === undefined || dataRows.length === 0) return { ok: false, reason: 'no_rows' };

  const { mapping, confidence } = detectColumns(header, dataRows.slice(0, COLUMN_SAMPLE_ROWS));

  const dateGuess = inferDateFormat(columnCells(dataRows, [mapping.date]));
  const date = resolveDateFormat(dateGuess, region);

  const notationGuess = inferNumberNotation(
    columnCells(dataRows, [mapping.amount, mapping.debit, mapping.credit, mapping.balance, mapping.limit])
  );
  const notationAmbiguous = notationGuess.kind === 'ambiguous';
  const notation = notationGuess.kind === 'ambiguous' ? notationFor(region.decimal) : notationGuess.notation;

  return {
    ok: true,
    prepared: {
      format: 'csv',
      csv: {
        header,
        dataRows,
        delimiter: tokens.delimiter,
        detected: mapping,
        confidence,
        dateGuess,
        dateFormat: date.format,
        dateAmbiguous: date.ambiguous,
        notationGuess,
        notation,
        notationAmbiguous,
      },
    },
  };
}

function prepareOfx(text: string, hints: { extension: string }, exponentFor: (code: string) => number | null): PrepareResult {
  const parsed = parseOfx(text, { exponentFor });
  if (!parsed.ok) {
    if (parsed.error === 'unsupported-statement') return { ok: false, reason: 'unsupported_statement' };
    if (parsed.error === 'too-large' || parsed.error === 'too-deep') return { ok: false, reason: 'too_big' };
    return { ok: false, reason: 'unreadable' };
  }
  const isQfx = hints.extension === 'qfx' || text.toUpperCase().includes('<INTU.');
  return { ok: true, prepared: { format: isQfx ? 'qfx' : 'ofx', statements: parsed.drafts } };
}

/**
 * Decodes the bytes (BOM, UTF-8, Windows-1252 fallback), sniffs the format from the content
 * (the extension is only a hint for OFX versus QFX), and runs the matching adapter.
 */
export function prepareImport(
  bytes: Uint8Array,
  hints: { extension: 'csv' | 'ofx' | 'qfx' | 'other' },
  region: PrepareRegion,
  exponentFor: (code: string) => number | null
): PrepareResult {
  const { text } = decodeText(bytes);
  const sniffed = sniffFormat(text);
  if (sniffed === 'unknown') return { ok: false, reason: 'unsupported_format' };
  if (sniffed === 'ofx') return prepareOfx(text, hints, exponentFor);
  return prepareCsv(text, region);
}

/** The multi-statement picker's rows (D-12): kind, currency and line count, never an account number. */
export function statementOptions(
  statements: readonly StatementDraft[]
): { index: number; kind: 'bank' | 'card'; currency: string | null; count: number }[] {
  return statements.map((s, index) => ({
    index,
    kind: s.accountHint === 'card' ? 'card' : 'bank',
    currency: s.currency,
    count: s.rows.length,
  }));
}

/** The CSV draft once the user has confirmed the mapping, date order and number notation. */
export function resolveCsvDraft(
  prepared: PreparedCsv,
  options: { mapping: ColumnMapping; dateFormat: DateFormat; notation: NumberNotation; account: { currency: string } },
  exponentFor: (code: string) => number | null
): StatementDraft {
  return csvToDraft(prepared.header, prepared.dataRows, {
    mapping: options.mapping,
    dateFormat: options.dateFormat,
    notation: options.notation,
    delimiter: prepared.delimiter,
    defaultCurrency: options.account.currency,
    exponentFor,
  });
}
