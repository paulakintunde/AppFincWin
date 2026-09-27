/**
 * CSV column-role detection, balance-label reading and mapping validation
 * (D-11, D-12, D-41, D-46, REC-10). `detectColumns` turns a header row plus
 * a handful of sample data rows into a correctable `ColumnMapping` -- the
 * user sees every detected role and can override it before commit. Nothing
 * here decides a sign or converts an amount; content sniffing only asks
 * "does this column look like a date / a number / free text", the same
 * structural question `parseCsvDate`/`parseNotatedAmount` already answer
 * for a single cell (plan 02-02/02-32), never a parsed value's meaning.
 *
 * `balanceLabelOf` only ever returns 'available' or 'owed' from a header --
 * 'held' is never inferred from a header (D-53): the target account's kind
 * decides that, downstream in the format profile.
 */
import { parseCsvDate, notationFor, type DateFormat } from './inferFormat';
import { parseNotatedAmount } from '../money';

export type ColumnRole =
  | 'date'
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'currency'
  | 'balance'
  | 'direction'
  | 'limit';

export interface ColumnMapping {
  date: number | null;
  description: number | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  currency: number | null;
  balance: number | null;
  direction: number | null;
  limit: number | null;
}

export type MappingError = 'no-date' | 'no-description' | 'no-amount' | 'amount-and-debit-credit' | 'duplicate-column';

export const HEADER_KEYWORDS: Readonly<Record<ColumnRole, readonly string[]>> = {
  date: ['date', 'transaction date', 'posted', 'posting date', 'value date', 'booking date', 'datum', 'fecha', 'data', 'buchungstag'],
  description: [
    'description', 'details', 'payee', 'merchant', 'narrative', 'memo', 'name', 'reference', 'transaction',
    'omschrijving', 'beschreibung', 'concepto', 'libelle', 'verwendungszweck',
  ],
  amount: ['amount', 'value', 'transaction amount', 'bedrag', 'betrag', 'importe', 'montant', 'importo'],
  debit: ['debit', 'paid out', 'money out', 'withdrawal', 'withdrawals', 'out', 'spent'],
  credit: ['credit', 'paid in', 'money in', 'deposit', 'deposits', 'in', 'received'],
  currency: ['currency', 'ccy', 'valuta', 'wahrung', 'moneda', 'devise'],
  balance: [
    'balance', 'running balance', 'saldo', 'solde', 'kontostand', 'available', 'available credit',
    'available balance', 'balance due', 'statement balance',
  ],
  direction: ['type', 'transaction type', 'dr/cr', 'debit/credit', 'direction'],
  limit: ['credit limit', 'overdraft limit', 'limit'],
};

// Resolution order: limit and balance first so 'Credit limit'/'Available
// credit' are never mistaken for a plain credit column; direction before
// debit/credit so a 'Debit/Credit' or 'DR/CR' header becomes a direction
// column rather than (incorrectly) a debit or credit column.
const ROLE_ORDER: readonly ColumnRole[] = [
  'limit', 'balance', 'direction', 'date', 'debit', 'credit', 'amount', 'currency', 'description',
];

const DATE_FORMATS: readonly DateFormat[] = ['YMD', 'DMY', 'MDY'];
const SNIFF_EXPONENT = 2; // structural check only -- no magnitude is kept from this

// Kept in sync with mapRows.ts's own DIRECTION_OUT/DIRECTION_IN (Task 2):
// a direction column's values must mostly be drawn from this table before
// the column is accepted as a direction role at all.
const DIRECTION_VALUE_WORDS = new Set([
  'debit', 'dr', 'sale', 'purchase', 'withdrawal', 'payment out', 'out',
  'credit', 'cr', 'payment', 'return', 'refund', 'deposit', 'in',
]);

export function normaliseHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function balanceLabelOf(header: string): 'held' | 'owed' | 'available' | null {
  const n = normaliseHeader(header);
  if (n.includes('available')) return 'available';
  if (n.includes('owed') || n.includes('balance due') || n.includes('statement balance') || n.includes('amount due')) {
    return 'owed';
  }
  return null;
}

function wordsOf(s: string): string[] {
  return s.split(/[^a-z0-9]+/).filter((w) => w.length > 0);
}

function containsPhrase(headerWords: readonly string[], phraseWords: readonly string[]): boolean {
  if (phraseWords.length === 0) return false;
  for (let i = 0; i + phraseWords.length <= headerWords.length; i += 1) {
    let match = true;
    for (let j = 0; j < phraseWords.length; j += 1) {
      if (headerWords[i + j] !== phraseWords[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function headerMatchesRole(header: string, role: ColumnRole): boolean {
  const normalised = normaliseHeader(header);
  const headerWords = wordsOf(normalised);
  for (const keyword of HEADER_KEYWORDS[role]) {
    if (normalised === keyword) return true;
    if (containsPhrase(headerWords, wordsOf(keyword))) return true;
  }
  return false;
}

function nonEmptyValues(sample: readonly (readonly string[])[], col: number): string[] {
  const values: string[] = [];
  for (const row of sample) {
    const cell = row[col];
    if (cell !== undefined && cell.trim() !== '') values.push(cell);
  }
  return values;
}

function isDirectionValue(cell: string): boolean {
  return DIRECTION_VALUE_WORDS.has(normaliseHeader(cell));
}

function columnPassesDirectionContent(sample: readonly (readonly string[])[], col: number): boolean {
  const values = nonEmptyValues(sample, col);
  if (values.length === 0) return false;
  const matches = values.filter((v) => isDirectionValue(v)).length;
  return matches / values.length >= 0.8;
}

function resolveRoleFromHeader(
  role: ColumnRole,
  header: readonly string[],
  sample: readonly (readonly string[])[],
  used: ReadonlySet<number>
): number | null {
  for (let i = 0; i < header.length; i += 1) {
    if (used.has(i)) continue;
    const cell = header[i];
    if (cell === undefined || !headerMatchesRole(cell, role)) continue;
    if (role === 'direction' && !columnPassesDirectionContent(sample, i)) continue;
    return i;
  }
  return null;
}

function sniffDateColumn(
  header: readonly string[],
  sample: readonly (readonly string[])[],
  used: ReadonlySet<number>
): number | null {
  for (let i = 0; i < header.length; i += 1) {
    if (used.has(i)) continue;
    const values = nonEmptyValues(sample, i);
    if (values.length === 0) continue;
    const passing = values.filter((v) => DATE_FORMATS.some((format) => parseCsvDate(v, format) !== null)).length;
    if (passing / values.length >= 0.8) return i;
  }
  return null;
}

function sniffAmountColumn(
  header: readonly string[],
  sample: readonly (readonly string[])[],
  used: ReadonlySet<number>
): number | null {
  const dotNotation = notationFor('.');
  const commaNotation = notationFor(',');
  for (let i = 0; i < header.length; i += 1) {
    if (used.has(i)) continue;
    const values = nonEmptyValues(sample, i);
    if (values.length === 0) continue;
    const dotPasses = values.filter((v) => parseNotatedAmount(v, dotNotation, SNIFF_EXPONENT).ok).length;
    const commaPasses = values.filter((v) => parseNotatedAmount(v, commaNotation, SNIFF_EXPONENT).ok).length;
    const passing = Math.max(dotPasses, commaPasses);
    if (passing / values.length >= 0.8) return i;
  }
  return null;
}

function sniffDescriptionColumn(
  header: readonly string[],
  sample: readonly (readonly string[])[],
  used: ReadonlySet<number>
): number | null {
  let best: number | null = null;
  let bestAvg = -1;
  for (let i = 0; i < header.length; i += 1) {
    if (used.has(i)) continue;
    const values = nonEmptyValues(sample, i);
    if (values.length === 0) continue;
    const avg = values.reduce((sum, v) => sum + v.trim().length, 0) / values.length;
    if (avg > bestAvg) {
      bestAvg = avg;
      best = i;
    }
  }
  return best;
}

export function detectColumns(
  header: readonly string[],
  sample: readonly (readonly string[])[]
): { mapping: ColumnMapping; confidence: 'high' | 'low' } {
  const mapping: ColumnMapping = {
    date: null,
    description: null,
    amount: null,
    debit: null,
    credit: null,
    currency: null,
    balance: null,
    direction: null,
    limit: null,
  };
  const used = new Set<number>();
  const viaHeader = new Set<ColumnRole>();

  for (const role of ROLE_ORDER) {
    if (role === 'amount' && mapping.debit !== null && mapping.credit !== null) continue;
    const idx = resolveRoleFromHeader(role, header, sample, used);
    if (idx !== null) {
      mapping[role] = idx;
      used.add(idx);
      viaHeader.add(role);
    }
  }

  if (mapping.date === null) {
    const idx = sniffDateColumn(header, sample, used);
    if (idx !== null) {
      mapping.date = idx;
      used.add(idx);
    }
  }
  if (mapping.amount === null && !(mapping.debit !== null && mapping.credit !== null)) {
    const idx = sniffAmountColumn(header, sample, used);
    if (idx !== null) {
      mapping.amount = idx;
      used.add(idx);
    }
  }
  if (mapping.description === null) {
    const idx = sniffDescriptionColumn(header, sample, used);
    if (idx !== null) {
      mapping.description = idx;
      used.add(idx);
    }
  }

  const amountConfident = viaHeader.has('amount') || (viaHeader.has('debit') && viaHeader.has('credit'));
  const confidence: 'high' | 'low' =
    viaHeader.has('date') && viaHeader.has('description') && amountConfident ? 'high' : 'low';

  return { mapping, confidence };
}

export function validateMapping(m: ColumnMapping): MappingError[] {
  const errors: MappingError[] = [];
  if (m.date === null) errors.push('no-date');
  if (m.description === null) errors.push('no-description');

  const hasAmount = m.amount !== null;
  const hasDebitOrCredit = m.debit !== null || m.credit !== null;
  if (!hasAmount && !hasDebitOrCredit) errors.push('no-amount');
  if (hasAmount && hasDebitOrCredit) errors.push('amount-and-debit-credit');

  const indices = [m.date, m.description, m.amount, m.debit, m.credit, m.currency, m.balance, m.direction, m.limit].filter(
    (i): i is number => i !== null
  );
  const seen = new Set<number>();
  let duplicate = false;
  for (const idx of indices) {
    if (seen.has(idx)) duplicate = true;
    seen.add(idx);
  }
  if (duplicate) errors.push('duplicate-column');

  return errors;
}
