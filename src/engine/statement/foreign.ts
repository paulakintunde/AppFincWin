/**
 * IMP-05 / D-30: the one shared, pure extractor for a statement line's
 * original foreign amount. Every adapter (PDF continuation text, OFX
 * CURRENCY/ORIGCURRENCY, CSV original-amount columns) hands what it found to
 * the helpers here, and everything downstream reads the one `ForeignAmount`
 * shape.
 *
 * The account-currency charged amount is the truth. The foreign amount is
 * provenance only and never drives FX stamping (D-34). When OFX states the
 * amount in the foreign currency, the charged amount comes from the
 * statement's own CURRATE with exact BigInt arithmetic, never a market rate.
 * The implied rate (D-33) is always computed from the two stored integers.
 *
 * Nothing here parses money with floats, throws for statement content, or
 * logs: an unreadable foreign figure yields null and the row imports as it
 * would without IMP-05.
 */
import {
  MAX_ABS_AMOUNT_MINOR,
  divideHalfUp,
  minorUnits,
  parseNotatedAmount,
  parseRate,
  RATE_SCALE,
  type MinorUnits,
  type NumberNotation,
} from '../money';
import { MAX_RAW_CELL, type ForeignAmount } from './types';

export interface ForeignOpts {
  notation: NumberNotation;
  exponentFor(code: string): number | null;
}

/** Bare '$' and '¥' are deliberately absent: they are ambiguous across currencies. */
export const FOREIGN_SYMBOLS: Readonly<Record<string, string>> = {
  'US$': 'USD',
  'C$': 'CAD',
  'CA$': 'CAD',
  'A$': 'AUD',
  'AU$': 'AUD',
  'NZ$': 'NZD',
  '€': 'EUR',
  '£': 'GBP',
};

const MAX_NOTE_INPUT = 200;

function escapeRe(s: string): string {
  return s.replace(/[$]/g, '\\$&');
}

const AMOUNT = "(-?[0-9][0-9.,'’]*)";
const SYMBOL_ALTERNATION = Object.keys(FOREIGN_SYMBOLS)
  .sort((a, b) => b.length - a.length)
  .map(escapeRe)
  .join('|');
const SYMBOL_RE = new RegExp(`^(${SYMBOL_ALTERNATION})\\s?${AMOUNT}(?=\\s|$)`);
const CODE_FIRST_RE = new RegExp(`^([A-Za-z]{3})\\s+${AMOUNT}(?=\\s|$)`);
const CODE_LAST_RE = new RegExp(`^${AMOUNT}\\s+([A-Za-z]{3})(?=\\s|$)`);

function readAmount(
  amountText: string,
  code: string,
  raw: string,
  opts: ForeignOpts
): ForeignAmount | null {
  const exponent = opts.exponentFor(code);
  if (exponent === null) return null;
  const parsed = parseNotatedAmount(amountText, opts.notation, exponent);
  if (!parsed.ok) return null;
  if (parsed.magnitude === 0 || parsed.magnitude > MAX_ABS_AMOUNT_MINOR) return null;
  return { magnitude: parsed.magnitude, currency: code, raw: raw.slice(0, MAX_RAW_CELL) };
}

export function parseForeignNote(text: string, opts: ForeignOpts): ForeignAmount | null {
  const t = text.trim().slice(0, MAX_NOTE_INPUT);

  const sym = SYMBOL_RE.exec(t);
  if (sym) {
    return readAmount(sym[2] as string, FOREIGN_SYMBOLS[sym[1] as string] as string, sym[0], opts);
  }
  const first = CODE_FIRST_RE.exec(t);
  if (first) {
    return readAmount(first[2] as string, (first[1] as string).toUpperCase(), first[0], opts);
  }
  const last = CODE_LAST_RE.exec(t);
  if (last) {
    return readAmount(last[1] as string, (last[2] as string).toUpperCase(), last[0], opts);
  }
  return null;
}

export type OfxForeignInput = {
  kind: 'currency' | 'origcurrency';
  trnAmtMagnitude: MinorUnits;
  accountExponent: number;
  curRate: string | null;
  curSym: string | null;
};

/**
 * OFX 2.x: CURRATE is the ratio of CURDEF currency to CURSYM currency
 * (account units per foreign unit).
 * - 'origcurrency': TRNAMT is already in the account currency, so
 *   foreign = TRNAMT / CURRATE.
 * - 'currency': TRNAMT is in CURSYM, so charged = TRNAMT x CURRATE.
 */
export function foreignFromOfx(
  input: OfxForeignInput,
  exponentFor: (code: string) => number | null
): { chargedMagnitude: MinorUnits; foreign: ForeignAmount } | null {
  const { kind, trnAmtMagnitude, accountExponent, curRate, curSym } = input;
  if (curRate === null || curSym === null) return null;
  const code = curSym.trim().toUpperCase();
  const foreignExponent = exponentFor(code);
  if (foreignExponent === null) return null;

  let rate: bigint;
  try {
    rate = parseRate(curRate.trim());
  } catch {
    return null;
  }

  const t = BigInt(trnAmtMagnitude);
  const scale = 10n ** BigInt(RATE_SCALE);
  const accScale = 10n ** BigInt(accountExponent);
  const forScale = 10n ** BigInt(foreignExponent);

  let charged: bigint;
  let foreign: bigint;
  if (kind === 'origcurrency') {
    charged = t;
    foreign = divideHalfUp(t * forScale * scale, rate * accScale);
  } else {
    foreign = t;
    charged = divideHalfUp(t * rate * accScale, forScale * scale);
  }

  const max = BigInt(MAX_ABS_AMOUNT_MINOR);
  if (foreign === 0n || charged === 0n || foreign > max || charged > max) return null;

  return {
    chargedMagnitude: minorUnits(parseInt(charged.toString(), 10)),
    foreign: {
      magnitude: minorUnits(parseInt(foreign.toString(), 10)),
      currency: code,
      raw: `${code} @ ${curRate.trim()}`.slice(0, MAX_RAW_CELL),
    },
  };
}

export function foreignFromColumns(
  amountCell: string,
  currencyCell: string,
  rowCurrency: string,
  opts: ForeignOpts
): ForeignAmount | null {
  const amount = amountCell.trim();
  const code = currencyCell.trim().toUpperCase();
  if (amount === '' || !/^[A-Z]{3}$/.test(code)) return null;
  if (code === rowCurrency.trim().toUpperCase()) return null;
  return readAmount(amount, code, `${amount} ${code}`, opts);
}

const RATE_DECIMALS = 4;

/**
 * D-33: account-currency units per one foreign unit, from the two stored
 * integers and their exponents, half-up to 4 decimals with trailing zeros
 * trimmed. BigInt only.
 */
export function impliedRate(
  charged: { magnitude: number; exponent: number },
  foreign: { magnitude: number; exponent: number }
): string {
  const den = BigInt(foreign.magnitude) * 10n ** BigInt(charged.exponent);
  if (den <= 0n) return '0';
  const num = BigInt(charged.magnitude) * 10n ** BigInt(foreign.exponent) * 10n ** BigInt(RATE_DECIMALS);
  const q = divideHalfUp(num, den).toString().padStart(RATE_DECIMALS + 1, '0');
  const whole = q.slice(0, q.length - RATE_DECIMALS);
  const frac = q.slice(q.length - RATE_DECIMALS).replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}

export const FX_FEE_PHRASES: readonly string[] = [
  'NON-STERLING TRANSACTION FEE',
  'NON-STERLING CASH FEE',
  'NON-STERLING FEE',
  'FOREIGN TRANSACTION FEE',
  'FOREIGN EXCHANGE FEE',
  'FX FEE',
  'CURRENCY CONVERSION FEE',
  'INTERNATIONAL TRANSACTION FEE',
  'CROSS-BORDER FEE',
  'NON-EURO TRANSACTION FEE',
];

export function isFxFeeDescription(description: string): boolean {
  const d = description.toUpperCase().split(/\s+/).filter(Boolean).join(' ');
  return FX_FEE_PHRASES.some((p) => d.includes(p));
}

export interface FeeLinkRow {
  index: number;
  localDate: string | null;
  description: string;
  amount: number | null;
  hasForeign: boolean;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function dayIndex(localDate: string | null): number | null {
  if (localDate === null) return null;
  const m = DATE_RE.exec(localDate);
  if (!m) return null;
  return Date.UTC(parseInt(m[1] as string, 10), parseInt(m[2] as string, 10) - 1, parseInt(m[3] as string, 10)) / DAY_MS;
}

/**
 * D-32: link a separately listed FX fee to its purchase only when that is
 * unambiguous. Candidates are foreign, non-fee rows with the same amount
 * sign, within one day, not yet linked. The row directly before the fee wins
 * if it is a candidate; otherwise exactly one candidate must exist. Never
 * guesses, never merges.
 */
export function linkFxFees(rows: readonly FeeLinkRow[]): Map<number, number> {
  const links = new Map<number, number>();
  const taken = new Set<number>();

  rows.forEach((fee, pos) => {
    if (!isFxFeeDescription(fee.description)) return;
    const feeDay = dayIndex(fee.localDate);
    if (feeDay === null || fee.amount === null || fee.amount === 0) return;
    const feeNeg = fee.amount < 0;

    const candidates: number[] = [];
    rows.forEach((r, p) => {
      if (p === pos || !r.hasForeign || isFxFeeDescription(r.description)) return;
      if (taken.has(r.index) || r.amount === null || r.amount === 0) return;
      if (r.amount < 0 !== feeNeg) return;
      const day = dayIndex(r.localDate);
      if (day === null || Math.abs(day - feeDay) > 1) return;
      candidates.push(p);
    });

    const before = candidates.includes(pos - 1) ? pos - 1 : -1;
    const chosen = before >= 0 ? before : candidates.length === 1 ? (candidates[0] as number) : -1;
    if (chosen < 0) return;
    const purchase = rows[chosen] as FeeLinkRow;
    links.set(fee.index, purchase.index);
    taken.add(purchase.index);
  });

  return links;
}
