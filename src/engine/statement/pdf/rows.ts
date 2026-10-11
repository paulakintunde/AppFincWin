// Generic table reader, stage 2: lines -> raw rows, statement figures, sections (D-18, D-22, D-23, D-24).
// Uncertainty is raised as flags for the draft stage; nothing here guesses. Bank and card hints are
// booleans only: no digits from identity lines are kept anywhere (D-14).
import { looksLikeDate, parsePeriod } from './dates';
import { findHeaders, looksNumeric, NUMERIC_ROLES, placeCell } from './layout';
import type { ColumnAnchor, ColumnRole, HeaderMatch, PdfCell, PdfLine } from './layout';

// 'stray-figure': a continuation line carried a figure that was not used (review ME-02).
export type RowFlag = 'wrapped' | 'no-date' | 'between' | 'both-columns' | 'stray-figure';

export interface RawRow {
  page: number;
  dateText: string | null;
  descriptionParts: string[];
  amountColumn: 'amount' | 'debit' | 'credit' | 'between' | null;
  amountText: string | null;
  debitText: string | null;
  creditText: string | null;
  candidates: string[] | null; // headerless mode only: numeric texts before the balance
  balanceText: string | null;
  flags: RowFlag[];
}

export interface TableSummary {
  openingText: string | null;
  closingText: string | null;
  limitText: string | null;
  availableText: string | null;
  periodLine: string | null;
  cardHint: boolean;
  bankHint: boolean;
  summaryLinesRemoved: boolean;
}

export interface AssembledTable {
  mode: 'header' | 'headerless';
  roles: ColumnRole[];
  availableLabel: boolean;
  rows: RawRow[];
  summary: TableSummary;
}

export interface PdfSectionSpan {
  label: 'checking' | 'savings' | 'card';
  fromLine: number;
  toLine: number;
}

export const OPENING_PHRASES = ['OPENING BALANCE', 'BALANCE BROUGHT FORWARD', 'BROUGHT FORWARD', 'PREVIOUS BALANCE', 'BALANCE B/F', 'BEGINNING BALANCE', 'START BALANCE'] as const;
export const CLOSING_PHRASES = ['CLOSING BALANCE', 'BALANCE CARRIED FORWARD', 'CARRIED FORWARD', 'NEW BALANCE', 'BALANCE C/F', 'ENDING BALANCE', 'END BALANCE'] as const;
export const REMOVED_PHRASES = ['MINIMUM PAYMENT', 'TOTAL', 'SUBTOTAL', 'SUB TOTAL', 'PAYMENT DUE'] as const; // matched at the start of the line's first text cell
const BANK_PHRASES = ['SORT CODE', 'ACCOUNT NUMBER', 'IBAN', 'ROUTING'] as const;
const CARD_PHRASES = ['CREDIT LIMIT', 'CARD ENDING', 'CARD NUMBER', 'MINIMUM PAYMENT'] as const;
const SECTION_LABELS: Readonly<Record<string, PdfSectionSpan['label']>> = {
  'CURRENT ACCOUNT': 'checking',
  'CHECKING ACCOUNT': 'checking',
  CHECKING: 'checking',
  'SAVINGS ACCOUNT': 'savings',
  SAVINGS: 'savings',
  'CREDIT CARD': 'card',
};

const lineText = (line: PdfLine): string => line.cells.map((c) => c.text).join(' ');
const hasAny = (up: string, phrases: readonly string[]): boolean => phrases.some((p) => up.includes(p));
const startsWithPhrase = (text: string, phrases: readonly string[]): boolean => {
  const up = text.toUpperCase();
  return phrases.some((p) => up === p || up.startsWith(`${p} `));
};
// A figure is either its own cell or the tail of a label cell ("Previous balance 820.40", "New balance 1,250.00 CR").
const TAIL_FIGURE = /\s(\S+(?:\s(?:CR|DR|OD))?)$/i;
const lastNumeric = (line: PdfLine): string | null => {
  const cell = [...line.cells].reverse().find((c) => looksNumeric(c.text));
  if (cell !== undefined) return cell.text;
  const tail = TAIL_FIGURE.exec(lineText(line))?.[1];
  return tail !== undefined && looksNumeric(tail) ? tail : null;
};
const hasDate = (line: PdfLine): boolean => line.cells.some((c) => looksLikeDate(c.text));

function sectionLabel(line: PdfLine): PdfSectionSpan['label'] | null {
  const key = line.cells[0]!.text.replace(/\s+/g, ' ').trim().toUpperCase();
  return !hasDate(line) && key in SECTION_LABELS ? SECTION_LABELS[key]! : null;
}

export function findSections(lines: readonly PdfLine[]): PdfSectionSpan[] {
  const starts: { label: PdfSectionSpan['label']; at: number }[] = [];
  lines.forEach((line, at) => {
    const label = sectionLabel(line);
    if (label !== null) starts.push({ label, at });
  });
  if (starts.length < 2) return [];
  return starts.map((s, i) => ({
    label: s.label,
    fromLine: s.at,
    toLine: i + 1 < starts.length ? starts[i + 1]!.at - 1 : lines.length - 1,
  }));
}

function emptySummary(): TableSummary {
  return {
    openingText: null,
    closingText: null,
    limitText: null,
    availableText: null,
    periodLine: null,
    cardHint: false,
    bankHint: false,
    summaryLinesRemoved: false,
  };
}

// The line's label: its text cells with any date cell and any figure removed, and a figure written at
// the end of the label cell ("Previous balance 820.40") trimmed off.
function labelOf(line: PdfLine): string {
  const text = line.cells
    .filter((c) => !looksLikeDate(c.text) && !looksNumeric(c.text))
    .map((c) => c.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tail = TAIL_FIGURE.exec(text);
  return (tail !== null && looksNumeric(tail[1]!) ? text.slice(0, tail.index) : text).trim().toUpperCase();
}

/**
 * Captures statement figures, the period and hints; true when the line must not become a row.
 *
 * Review HI-02: an undated line is a summary line when it mentions a summary phrase anywhere. A dated
 * line is a transaction unless its whole label is the phrase ("01 Sep  Balance brought forward"), so a
 * purchase at NEW BALANCE, ACME CREDIT LIMITED or "12.09.26 TOTAL GAS & POWER" is never dropped and
 * never overwrites a stated figure.
 */
function classify(line: PdfLine, s: TableSummary): boolean {
  const text = lineText(line);
  const up = text.toUpperCase();
  if (s.periodLine === null && (up.includes('PERIOD') || parsePeriod(text, true) !== null)) s.periodLine = text;
  const undated = !hasDate(line);
  const bankLine = undated && hasAny(up, BANK_PHRASES);
  const cardLine = undated && hasAny(up, CARD_PHRASES);
  if (bankLine) s.bankHint = true;
  if (cardLine) s.cardHint = true;
  const label = undated ? '' : labelOf(line);
  const is = (phrases: readonly string[]): boolean => (undated ? hasAny(up, phrases) : phrases.includes(label));
  const last = lastNumeric(line);
  if (is(OPENING_PHRASES)) {
    s.openingText = s.openingText ?? last;
    return true;
  }
  if (is(CLOSING_PHRASES)) {
    s.closingText = last ?? s.closingText;
    return true;
  }
  if (is(['CREDIT LIMIT'])) {
    s.limitText = last;
    return true;
  }
  if (is(['AVAILABLE CREDIT'])) {
    s.availableText = last;
    return true;
  }
  const first = line.cells.find((c) => !looksNumeric(c.text));
  const removed = undated ? first !== undefined && startsWithPhrase(first.text, REMOVED_PHRASES) : REMOVED_PHRASES.some((p) => p === label);
  if (removed) {
    s.summaryLinesRemoved = true;
    return true;
  }
  return bankLine || cardLine;
}

function newRow(page: number): RawRow {
  return {
    page,
    dateText: null,
    descriptionParts: [],
    amountColumn: null,
    amountText: null,
    debitText: null,
    creditText: null,
    candidates: null,
    balanceText: null,
    flags: [],
  };
}

function addFlag(row: RawRow, flag: RowFlag): void {
  if (!row.flags.includes(flag)) row.flags.push(flag);
}

function setAmountColumn(row: RawRow, col: NonNullable<RawRow['amountColumn']>): void {
  if (row.amountColumn === null) row.amountColumn = col;
}

function applyNumeric(row: RawRow, cell: PdfCell, anchors: readonly ColumnAnchor[]): void {
  const p = placeCell(cell, anchors);
  if (p.kind === 'between') {
    if (row.amountText === null) row.amountText = cell.text;
    setAmountColumn(row, 'between');
    addFlag(row, 'between');
    return;
  }
  if (p.role === 'amount' && row.amountText === null) {
    row.amountText = cell.text;
    setAmountColumn(row, 'amount');
  } else if (p.role === 'debit' && row.debitText === null) {
    row.debitText = cell.text;
    setAmountColumn(row, 'debit');
  } else if (p.role === 'credit' && row.creditText === null) {
    row.creditText = cell.text;
    setAmountColumn(row, 'credit');
  } else if (p.role === 'balance' && row.balanceText === null) {
    row.balanceText = cell.text;
  }
}

const isMoneyPlacement = (cell: PdfCell, anchors: readonly ColumnAnchor[]): boolean => {
  const p = placeCell(cell, anchors);
  return p.kind === 'between' || p.role === 'amount' || p.role === 'debit' || p.role === 'credit';
};

// A date-like cell counts as the date when, treated as text, it sits nearest the date column.
const isDateCell = (cell: PdfCell, anchors: readonly ColumnAnchor[]): boolean => {
  if (!looksLikeDate(cell.text)) return false;
  const p = placeCell({ ...cell, text: '' }, anchors);
  return p.kind === 'column' && p.role === 'date';
};

function headerRows(lines: readonly PdfLine[], headers: readonly HeaderMatch[], summary: TableSummary): RawRow[] {
  const starts = new Map(headers.map((h) => [h.line, h]));
  const seconds = new Set(headers.filter((h) => h.span === 2).map((h) => h.line + 1));
  const rows: RawRow[] = [];
  let anchors: readonly ColumnAnchor[] | null = null;
  lines.forEach((line, i) => {
    const header = starts.get(i);
    if (header !== undefined) {
      anchors = header.anchors;
      return;
    }
    if (seconds.has(i) || sectionLabel(line) !== null || classify(line, summary) || anchors === null) return;
    const active: readonly ColumnAnchor[] = anchors;
    const dateCell = line.cells.find((c) => isDateCell(c, active));
    // Review ME-02: on an undated line, a figure that ends left of every numeric column sits in the
    // description ("USD" "45.00" split into two runs), so it is text, never an amount.
    const moneyLeft = Math.min(...active.filter((a) => NUMERIC_ROLES.includes(a.role)).map((a) => a.x0));
    const inText = (c: PdfCell): boolean => dateCell === undefined && c.x1 < moneyLeft;
    const numeric = line.cells.filter((c) => c !== dateCell && looksNumeric(c.text) && !inText(c));
    const text = line.cells.filter((c) => c !== dateCell && (!looksNumeric(c.text) || inText(c)));
    if (dateCell !== undefined || numeric.some((c) => isMoneyPlacement(c, active))) {
      const row = newRow(line.page);
      row.dateText = dateCell?.text ?? null;
      if (dateCell === undefined) addFlag(row, 'no-date');
      row.descriptionParts = text.map((c) => c.text);
      numeric.forEach((c) => applyNumeric(row, c, active));
      if (row.debitText !== null && row.creditText !== null) addFlag(row, 'both-columns');
      rows.push(row);
      return;
    }
    const prev = rows[rows.length - 1] as RawRow | undefined;
    if (prev === undefined || prev.page !== line.page) return; // a page's running header is not a wrapped description
    // One part per continuation line, so a foreign note split into runs still reads as one note.
    if (text.length > 0) {
      prev.descriptionParts.push(text.map((c) => c.text).join(' '));
      addFlag(prev, 'wrapped');
    }
    // Review ME-02: a continuation line never fills the row's amount or balance; its figure is
    // left unused and the row is flagged so it is reviewed rather than silently re-reconciled.
    if (numeric.length > 0) addFlag(prev, 'stray-figure');
  });
  return rows;
}

function headerlessRows(lines: readonly PdfLine[], summary: TableSummary): RawRow[] | null {
  const rows: RawRow[] = [];
  lines.forEach((line) => {
    if (sectionLabel(line) !== null || classify(line, summary)) return;
    const cells = line.cells;
    const firstCell = cells[0]!;
    if (cells.length >= 2 && looksLikeDate(firstCell.text) && looksNumeric(cells[cells.length - 1]!.text)) {
      let from = cells.length;
      while (from > 1 && cells.length - from < 3 && looksNumeric(cells[from - 1]!.text)) from--;
      const nums = cells.slice(from).map((c) => c.text);
      const row = newRow(line.page);
      row.dateText = firstCell.text;
      row.descriptionParts = cells.slice(1, from).map((c) => c.text);
      row.balanceText = nums.length >= 2 ? nums[nums.length - 1]! : null;
      row.candidates = nums.length >= 2 ? nums.slice(0, -1) : nums;
      rows.push(row);
      return;
    }
    const prev = rows[rows.length - 1] as RawRow | undefined;
    if (prev !== undefined && prev.page === line.page && !looksLikeDate(firstCell.text) && !cells.some((c) => looksNumeric(c.text))) {
      prev.descriptionParts.push(...cells.map((c) => c.text));
      addFlag(prev, 'wrapped');
    }
  });
  if (rows.length < 3) return null;
  return rows;
}

export function assembleTable(lines: readonly PdfLine[]): AssembledTable | null {
  const summary = emptySummary();
  const headers = findHeaders(lines);
  if (headers.length > 0) {
    const first = headers[0]!;
    const rows = headerRows(lines, headers, summary);
    const roles = [...new Set(first.anchors.map((a) => a.role).filter((r) => r !== 'other'))];
    return { mode: 'header', roles, availableLabel: first.availableLabel, rows, summary };
  }
  const rows = headerlessRows(lines, summary);
  if (rows === null) return null;
  const roles: ColumnRole[] = ['date', 'description', 'amount'];
  if (rows.some((r) => r.balanceText !== null)) roles.push('balance');
  return { mode: 'headerless', roles, availableLabel: false, rows, summary };
}
