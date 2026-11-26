/**
 * Shared reading steps for the wallet readers: header lookup, integer money
 * parsing, date parsing and line assembly. Column layouts live in the three
 * reader files; each wallet's date format is one constant there so plan 10-28
 * (the owner's real files, D-24) changes one line.
 */
import { parseDecimalString, resolveExponent } from '../../money';
import { MAX_DESCRIPTION, MAX_EXTERNAL_ID } from '../types';
import type { WalletKind, WalletLine, WalletRead } from './types';

export function norm(h: string): string {
  return h.replace(/^﻿/, '').trim().toLowerCase();
}

/** Signed integer minor units from a plain decimal cell; null when unreadable. */
export function parseMoney(raw: string, currency: string): number | null {
  const m = /^([-+−]?)(.*)$/.exec(raw.trim()) as RegExpExecArray;
  const exp = resolveExponent(currency);
  const r = parseDecimalString(m[2] as string, { locale: 'en-US', maxFractionDigits: exp });
  if (!r.ok) return null;
  const [whole, frac = ''] = r.value.split('.');
  const n = Number(`${whole}${frac.padEnd(exp, '0')}`);
  if (!Number.isSafeInteger(n)) return null;
  return m[1] === '-' || m[1] === '−' ? 0 - n : n;
}

export interface DateFormat {
  re: RegExp;
  order: readonly [number, number, number]; // capture group positions of [year, month, day]
}

export function parseDate(raw: string, fmt: DateFormat): string | null {
  const m = fmt.re.exec(raw.trim());
  if (m === null) return null;
  const y = Number(m[fmt.order[0]]);
  const mo = Number(m[fmt.order[1]]);
  const d = Number(m[fmt.order[2]]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export type RowResult = 'skip' | 'bad' | Omit<WalletLine, 'index'>;

export interface AssembleInput {
  currency: string;
  dateRaw: string;
  dateFormat: DateFormat;
  amountRaw: string;
  feeRaw: string;
  balanceRaw: string;
  description: string;
  externalId: string | null;
  pairKey: string | null;
  conversion: boolean;
}

/** Builds one line from raw cells: 'bad' when a needed cell is unreadable, 'skip' when nothing moves. */
export function assemble(a: AssembleInput): RowResult {
  const currency = a.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return 'bad';
  const localDate = parseDate(a.dateRaw, a.dateFormat);
  const gross = parseMoney(a.amountRaw, currency);
  const feeSigned = a.feeRaw === '' ? 0 : parseMoney(a.feeRaw, currency);
  if (localDate === null || gross === null || feeSigned === null) return 'bad';
  const feeMinor = Math.abs(feeSigned);
  if (gross === 0 && feeMinor === 0) return 'skip';
  const balance = a.balanceRaw === '' ? null : parseMoney(a.balanceRaw, currency);
  const kind = gross === 0 ? 'fee-only' : a.conversion ? 'conversion' : 'payment';
  return {
    currency,
    localDate,
    description: a.description.replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION),
    grossMinor: gross,
    feeMinor,
    netMinor: gross - feeMinor,
    externalId: a.externalId === null ? null : a.externalId.slice(0, MAX_EXTERNAL_ID),
    pairKey: a.pairKey,
    kind,
    balanceMinor: balance,
  };
}

export type Getter = (column: string) => string;

/** Runs a wallet's row mapper over the data rows; required columns are checked once up front. */
export function runReader(
  wallet: WalletKind,
  rows: string[][],
  required: readonly string[],
  rowFn: (get: Getter) => RowResult
): WalletRead {
  const header = (rows[0] as string[]).map(norm);
  const missing = required.filter((r) => !header.includes(norm(r)));
  if (missing.length > 0) return { ok: false, wallet, error: 'missing-column', missing };
  const lines: WalletLine[] = [];
  let skipped = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i] as string[];
    const get: Getter = (column) => {
      const c = header.indexOf(norm(column));
      // tokenize pads short rows to the header length, so the cell always exists
      return c < 0 ? '' : (cells[c] as string).trim();
    };
    const r = rowFn(get);
    if (r === 'skip') {
      skipped += 1;
    } else if (r === 'bad') {
      return { ok: false, wallet, error: 'unreadable' };
    } else {
      lines.push({ ...r, index: i - 1 });
    }
  }
  return { ok: true, wallet, lines, skipped };
}
