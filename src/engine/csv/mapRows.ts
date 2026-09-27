/**
 * Converts mapped CSV rows into the shared, sign-free `StatementDraft`
 * (D-11, D-14, D-15, D-45, D-46, REC-10, REC-14, REC-15). This is the one
 * place a CSV file's cells become `DraftRow`s -- it never decides what a
 * marker *means* (D-43): amount/debit/credit/direction evidence all resolve
 * to a magnitude plus an `AmountMarker`, and the format profile
 * (engine/statement/convert.ts, plan 02-35/36) applies D-44's stored-sign
 * rule afterwards. Opening/closing summary lines are detected and removed
 * here (D-46 step 5) so they are never imported as transactions.
 */
import { balanceLabelOf, normaliseHeader, type ColumnMapping } from './detectColumns';
import { parseCsvDate, type DateFormat } from './inferFormat';
import type { Delimiter } from './tokenize';
import {
  markerSign,
  minorUnits,
  parseNotatedAmount,
  type AmountMarker,
  type MinorUnits,
  type NumberNotation,
  type NotatedAmountError,
  type NotatedAmountResult,
} from '../money';
import {
  MAX_RAW_CELL,
  MAX_LAYOUT_SIGNATURE,
  type StatementDraft,
  type DraftRow,
  type DraftRowIssue,
  type StatedBalance,
  type LabelEvidence,
  type DraftWarning,
} from '../statement';

export const MAX_NAME_LENGTH = 200; // = MAX_DESCRIPTION, mirrors the DB check added in 02-07

// Kept in sync with detectColumns.ts's private direction-value word set,
// which uses the same table to decide whether an otherwise header-matched
// 'Type'/'Direction' column is accepted as a direction role at all.
export const DIRECTION_OUT = ['debit', 'dr', 'sale', 'purchase', 'withdrawal', 'payment out', 'out'] as const;
export const DIRECTION_IN = ['credit', 'cr', 'payment', 'return', 'refund', 'deposit', 'in'] as const;

export interface CsvDraftOptions {
  mapping: ColumnMapping;
  dateFormat: DateFormat;
  notation: NumberNotation;
  delimiter: Delimiter;
  defaultCurrency: string; // target account currency (D-12)
  exponentFor: (code: string) => number | null; // null = unknown currency
}

export function layoutSignatureOf(header: readonly string[], delimiter: Delimiter, decimal: '.' | ','): string {
  const normalisedHeaders = header.map((h) => normaliseHeader(h));
  const signature = `${normalisedHeaders.join('|')}||${delimiter}|${decimal}`;
  return signature.length > MAX_LAYOUT_SIGNATURE ? signature.slice(0, MAX_LAYOUT_SIGNATURE) : signature;
}

function cell(dataRow: readonly string[], col: number | null): string {
  if (col === null) return '';
  return dataRow[col] ?? '';
}

/** Maps a failed parse's error to the one row issue it represents. */
function issueForParseError(error: NotatedAmountError): DraftRowIssue {
  if (error === 'too-large') return 'amount-too-large';
  if (error === 'conflicting-markers') return 'conflicting-markers';
  return 'bad-amount';
}

/** Resolves a parsed amount with no forced column/direction sign -- the plain single-amount-column case. */
function resolvePlainAmount(parsed: NotatedAmountResult): { magnitude: MinorUnits | null; marker: AmountMarker; issue: DraftRowIssue | null } {
  if (!parsed.ok) return { magnitude: null, marker: 'none', issue: issueForParseError(parsed.error) };
  if (parsed.magnitude === 0) return { magnitude: parsed.magnitude, marker: parsed.marker, issue: 'zero-amount' };
  return { magnitude: parsed.magnitude, marker: parsed.marker, issue: null };
}

/**
 * Resolves a parsed amount whose column (debit/credit) or paired direction
 * value already asserts a sign -- the column/direction is authoritative, and
 * an inner marker only ever confirms or contradicts it (never overrides it).
 * A 'none' inner marker is always compatible (an unsigned cell in a debit
 * column is the ordinary case, not a conflict).
 */
function resolveForcedSign(
  parsed: NotatedAmountResult,
  forcedMarker: 'dr' | 'cr'
): { magnitude: MinorUnits | null; issue: DraftRowIssue | null } {
  if (!parsed.ok) return { magnitude: null, issue: issueForParseError(parsed.error) };
  if (parsed.marker !== 'none') {
    const innerSign = markerSign(parsed.marker);
    const forcedSign = forcedMarker === 'dr' ? -1 : 1;
    if (innerSign !== forcedSign) return { magnitude: null, issue: 'conflicting-markers' };
  }
  return { magnitude: parsed.magnitude, issue: null };
}

interface AmountResolution {
  magnitude: MinorUnits | null;
  marker: AmountMarker;
  rawAmount: string | null;
  issue: DraftRowIssue | null;
  trnType: string | null;
  fromAmountColumn: boolean; // true only when the dr/cr evidence (if any) came from the single amount column
}

function resolveDebitCredit(
  dataRow: readonly string[],
  mapping: ColumnMapping,
  notation: NumberNotation,
  exponent: number
): AmountResolution {
  const debitCell = mapping.debit !== null ? cell(dataRow, mapping.debit).trim() : '';
  const creditCell = mapping.credit !== null ? cell(dataRow, mapping.credit).trim() : '';

  if (debitCell === '' && creditCell === '') {
    return { magnitude: null, marker: 'none', rawAmount: null, issue: 'bad-amount', trnType: null, fromAmountColumn: false };
  }

  if (debitCell !== '' && creditCell !== '') {
    const debitParsed = parseNotatedAmount(debitCell, notation, exponent);
    const creditParsed = parseNotatedAmount(creditCell, notation, exponent);
    const debitResolved = resolveForcedSign(debitParsed, 'dr');
    const creditResolved = resolveForcedSign(creditParsed, 'cr');
    const rawAmount = debitCell.slice(0, MAX_RAW_CELL);

    if (debitResolved.issue !== null) {
      return { magnitude: null, marker: 'none', rawAmount, issue: debitResolved.issue, trnType: null, fromAmountColumn: false };
    }
    if (creditResolved.issue !== null) {
      return { magnitude: null, marker: 'none', rawAmount, issue: creditResolved.issue, trnType: null, fromAmountColumn: false };
    }
    const net = (creditResolved.magnitude as number) - (debitResolved.magnitude as number);
    const marker: AmountMarker = net >= 0 ? 'cr' : 'dr';
    const magnitude = minorUnits(Math.abs(net) === 0 ? 0 : Math.abs(net));
    const issue: DraftRowIssue | null = magnitude === 0 ? 'zero-amount' : null;
    return { magnitude, marker, rawAmount, issue, trnType: null, fromAmountColumn: false };
  }

  const filled = debitCell !== '' ? debitCell : creditCell;
  const forcedMarker: 'dr' | 'cr' = debitCell !== '' ? 'dr' : 'cr';
  const parsed = parseNotatedAmount(filled, notation, exponent);
  const resolved = resolveForcedSign(parsed, forcedMarker);
  const rawAmount = filled.slice(0, MAX_RAW_CELL);

  if (resolved.issue !== null) {
    return { magnitude: null, marker: 'none', rawAmount, issue: resolved.issue, trnType: null, fromAmountColumn: false };
  }
  if (resolved.magnitude === 0) {
    return { magnitude: resolved.magnitude, marker: forcedMarker, rawAmount, issue: 'zero-amount', trnType: null, fromAmountColumn: false };
  }
  return { magnitude: resolved.magnitude, marker: forcedMarker, rawAmount, issue: null, trnType: null, fromAmountColumn: false };
}

function resolveAmountColumn(
  dataRow: readonly string[],
  mapping: ColumnMapping,
  notation: NumberNotation,
  exponent: number
): AmountResolution {
  const rawCell = cell(dataRow, mapping.amount).trim();
  const parsed = parseNotatedAmount(rawCell, notation, exponent);
  const rawAmount = rawCell.slice(0, MAX_RAW_CELL);

  if (mapping.direction !== null) {
    const dirNorm = normaliseHeader(cell(dataRow, mapping.direction));
    const isOut = (DIRECTION_OUT as readonly string[]).includes(dirNorm);
    const isIn = (DIRECTION_IN as readonly string[]).includes(dirNorm);

    if (isOut || isIn) {
      const forcedMarker: 'dr' | 'cr' = isOut ? 'dr' : 'cr';
      const trnType = isOut ? 'DEBIT' : 'CREDIT';
      const resolved = resolveForcedSign(parsed, forcedMarker);
      if (resolved.issue !== null) {
        return { magnitude: null, marker: 'none', rawAmount, issue: resolved.issue, trnType, fromAmountColumn: false };
      }
      if (resolved.magnitude === 0) {
        return { magnitude: resolved.magnitude, marker: forcedMarker, rawAmount, issue: 'zero-amount', trnType, fromAmountColumn: true };
      }
      return { magnitude: resolved.magnitude, marker: forcedMarker, rawAmount, issue: null, trnType, fromAmountColumn: true };
    }
    // The direction cell's value isn't in either table for this row -- fall
    // through to the plain amount reading, with no trnType assigned.
  }

  const plain = resolvePlainAmount(parsed);
  return { ...plain, rawAmount, trnType: null, fromAmountColumn: true };
}

function resolveAmount(
  dataRow: readonly string[],
  mapping: ColumnMapping,
  notation: NumberNotation,
  exponent: number
): AmountResolution {
  if (mapping.debit !== null || mapping.credit !== null) {
    return resolveDebitCredit(dataRow, mapping, notation, exponent);
  }
  if (mapping.amount !== null) {
    return resolveAmountColumn(dataRow, mapping, notation, exponent);
  }
  return { magnitude: null, marker: 'none', rawAmount: null, issue: 'bad-amount', trnType: null, fromAmountColumn: false };
}

function resolveCurrency(
  dataRow: readonly string[],
  mapping: ColumnMapping,
  defaultCurrency: string,
  defaultExponent: number,
  exponentFor: (code: string) => number | null
): { currency: string; exponent: number; issue: DraftRowIssue | null } {
  if (mapping.currency === null) return { currency: defaultCurrency, exponent: defaultExponent, issue: null };
  const raw = cell(dataRow, mapping.currency).trim();
  if (raw === '') return { currency: defaultCurrency, exponent: defaultExponent, issue: null };
  const code = raw.toUpperCase();
  const exponent = exponentFor(code);
  if (exponent !== null) return { currency: code, exponent, issue: null };
  return { currency: defaultCurrency, exponent: defaultExponent, issue: 'unknown-currency' };
}

function resolveBalance(
  dataRow: readonly string[],
  mapping: ColumnMapping,
  notation: NumberNotation,
  exponent: number
): { balanceMagnitude: MinorUnits | null; balanceMarker: AmountMarker; rawBalance: string | null; issue: DraftRowIssue | null } {
  if (mapping.balance === null) {
    return { balanceMagnitude: null, balanceMarker: 'none', rawBalance: null, issue: null };
  }
  const raw = cell(dataRow, mapping.balance).trim();
  if (raw === '') return { balanceMagnitude: null, balanceMarker: 'none', rawBalance: null, issue: null };
  const rawBalance = raw.slice(0, MAX_RAW_CELL);
  const parsed = parseNotatedAmount(raw, notation, exponent);
  if (!parsed.ok) return { balanceMagnitude: null, balanceMarker: 'none', rawBalance, issue: 'bad-balance' };
  return { balanceMagnitude: parsed.magnitude, balanceMarker: parsed.marker, rawBalance, issue: null };
}

function findStatedLimit(
  dataRows: readonly (readonly string[])[],
  mapping: ColumnMapping,
  notation: NumberNotation,
  exponent: number
): MinorUnits | null {
  if (mapping.limit === null) return null;
  for (const row of dataRows) {
    const raw = cell(row, mapping.limit).trim();
    if (raw === '') continue;
    const parsed = parseNotatedAmount(raw, notation, exponent);
    if (parsed.ok) return parsed.magnitude;
  }
  return null;
}

function rowHasNoAmountContent(dataRow: readonly string[], mapping: ColumnMapping): boolean {
  const amountEmpty = mapping.amount === null || cell(dataRow, mapping.amount).trim() === '';
  const debitEmpty = mapping.debit === null || cell(dataRow, mapping.debit).trim() === '';
  const creditEmpty = mapping.credit === null || cell(dataRow, mapping.credit).trim() === '';
  return amountEmpty && debitEmpty && creditEmpty;
}

export function csvToDraft(
  header: readonly string[],
  dataRows: readonly (readonly string[])[],
  opts: CsvDraftOptions
): StatementDraft {
  const { mapping, dateFormat, notation, delimiter, defaultCurrency, exponentFor } = opts;

  const defaultExponent = exponentFor(defaultCurrency);
  if (defaultExponent === null) {
    // Never carries cell content -- the default currency is a fixed, caller-
    // supplied setting, not user file input (threat register T-02-03-06).
    throw new RangeError('csvToDraft: default currency has no exponent');
  }

  const labels = new Set<LabelEvidence>();
  if (mapping.debit !== null || mapping.credit !== null) labels.add('debit-credit-columns');
  if (mapping.direction !== null) labels.add('direction-column');
  if (mapping.limit !== null) labels.add('limit-label');
  if (mapping.balance !== null) {
    const balanceLabel = balanceLabelOf(header[mapping.balance] ?? '');
    if (balanceLabel === 'available') labels.add('available-balance-label');
    if (balanceLabel === 'owed') labels.add('owed-balance-label');
  }

  const statedLimit = findStatedLimit(dataRows, mapping, notation, defaultExponent);

  const built: DraftRow[] = [];
  const noAmountContent: boolean[] = [];
  let sawDrCrMarker = false;
  let sawOdMarker = false;

  for (let i = 0; i < dataRows.length; i += 1) {
    const dataRow = dataRows[i] as readonly string[];

    const rawDate = cell(dataRow, mapping.date).trim();
    const localDate = mapping.date !== null && rawDate !== '' ? parseCsvDate(rawDate, dateFormat) : null;

    let description = cell(dataRow, mapping.description).trim().replace(/\s+/g, ' ');
    if (description.length > MAX_NAME_LENGTH) description = description.slice(0, MAX_NAME_LENGTH);

    const currencyResolved = resolveCurrency(dataRow, mapping, defaultCurrency, defaultExponent, exponentFor);
    const amountResolved = resolveAmount(dataRow, mapping, notation, currencyResolved.exponent);
    const balanceResolved = resolveBalance(dataRow, mapping, notation, currencyResolved.exponent);

    const issues: DraftRowIssue[] = [];
    if (localDate === null) issues.push('bad-date');
    if (description === '') issues.push('empty-description');
    if (currencyResolved.issue !== null) issues.push(currencyResolved.issue);
    if (amountResolved.issue !== null) issues.push(amountResolved.issue);
    if (balanceResolved.issue !== null) issues.push(balanceResolved.issue);

    if (amountResolved.fromAmountColumn && (amountResolved.marker === 'dr' || amountResolved.marker === 'cr')) {
      sawDrCrMarker = true;
    }
    if (balanceResolved.balanceMarker === 'od') sawOdMarker = true;

    built.push({
      index: i,
      localDate,
      description,
      magnitude: amountResolved.magnitude,
      marker: amountResolved.marker,
      rawAmount: amountResolved.rawAmount,
      balanceMagnitude: balanceResolved.balanceMagnitude,
      balanceMarker: balanceResolved.balanceMarker,
      rawBalance: balanceResolved.rawBalance,
      currency: currencyResolved.currency,
      externalId: null,
      trnType: amountResolved.trnType,
      issues,
    });
    noAmountContent.push(rowHasNoAmountContent(dataRow, mapping));
  }

  if (sawDrCrMarker) labels.add('dr-cr-markers');
  if (sawOdMarker) labels.add('od-marker');

  // Summary lines (D-46 step 5): explicit phrase-matched rows first, then
  // implicit "no amount, but a readable balance" candidates -- removed from
  // the row set and folded into statedOpening/statedClosing, never imported.
  // Every candidate here was already filtered on `balanceMagnitude !== null`,
  // and resolveBalance only ever returns a non-null balanceMagnitude paired
  // with a non-null rawBalance -- so the `as string` casts below narrow a
  // structurally-guaranteed invariant, not an assumption.
  let statedOpening: StatedBalance | null = null;
  let statedClosing: StatedBalance | null = null;
  const explicitRemoved = new Set<number>();

  for (let i = 0; i < built.length; i += 1) {
    const row = built[i] as DraftRow;
    if (row.balanceMagnitude === null) continue;
    const normDesc = row.description.toLowerCase();
    if (normDesc.startsWith('opening balance') || normDesc.startsWith('balance brought forward')) {
      statedOpening = { magnitude: row.balanceMagnitude, marker: row.balanceMarker, asOf: row.localDate, raw: row.rawBalance as string };
      explicitRemoved.add(i);
      continue;
    }
    if (normDesc.startsWith('closing balance') || normDesc.startsWith('balance carried forward')) {
      statedClosing = { magnitude: row.balanceMagnitude, marker: row.balanceMarker, asOf: row.localDate, raw: row.rawBalance as string };
      explicitRemoved.add(i);
    }
  }

  const candidateIdxs: number[] = [];
  for (let i = 0; i < built.length; i += 1) {
    if (explicitRemoved.has(i)) continue;
    const row = built[i] as DraftRow;
    if (noAmountContent[i] === true && row.balanceMagnitude !== null) candidateIdxs.push(i);
  }

  const implicitRemoved = new Set<number>();
  if (candidateIdxs.length > 0) {
    const transactionIdxs: number[] = [];
    for (let i = 0; i < built.length; i += 1) {
      if (!explicitRemoved.has(i) && !candidateIdxs.includes(i)) transactionIdxs.push(i);
    }

    const first = candidateIdxs[0] as number;
    const precedesAllTransactions = transactionIdxs.every((t) => first < t);
    if (statedOpening === null && transactionIdxs.length > 0 && precedesAllTransactions) {
      const row = built[first] as DraftRow;
      statedOpening = {
        magnitude: row.balanceMagnitude as MinorUnits,
        marker: row.balanceMarker,
        asOf: row.localDate,
        raw: row.rawBalance as string,
      };
      implicitRemoved.add(first);
    }

    const last = candidateIdxs[candidateIdxs.length - 1] as number;
    const followsAllTransactions = transactionIdxs.every((t) => last > t);
    if (!implicitRemoved.has(last) && statedClosing === null && transactionIdxs.length > 0 && followsAllTransactions) {
      const row = built[last] as DraftRow;
      statedClosing = {
        magnitude: row.balanceMagnitude as MinorUnits,
        marker: row.balanceMarker,
        asOf: row.localDate,
        raw: row.rawBalance as string,
      };
      implicitRemoved.add(last);
    }
  }

  const removed = new Set<number>([...explicitRemoved, ...implicitRemoved]);
  const rows: DraftRow[] = [];
  let nextIndex = 0;
  for (let i = 0; i < built.length; i += 1) {
    if (removed.has(i)) continue;
    const row = built[i] as DraftRow;
    rows.push({ ...row, index: nextIndex });
    nextIndex += 1;
  }

  const warnings: DraftWarning[] = [];
  if (removed.size > 0) warnings.push('summary-lines-removed');

  const dates = rows.map((r) => r.localDate).filter((d): d is string => d !== null);
  const periodStart = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null;
  const periodEnd = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;

  const balanceLabel = mapping.balance !== null ? balanceLabelOf(header[mapping.balance] ?? '') : null;

  return {
    source: 'csv',
    layoutSignature: layoutSignatureOf(header, delimiter, notation.decimal),
    accountHint: null,
    currency: null,
    rows,
    statedOpening,
    statedClosing,
    available: null,
    statedLimit,
    balanceLabel,
    labels: [...labels],
    periodStart,
    periodEnd,
    warnings,
  };
}
