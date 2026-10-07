/**
 * D-40: the one adapter contract. Every statement format (CSV, OFX/QFX now;
 * PDF and bank feeds later) produces a `StatementDraft` and nothing else --
 * there is no second transaction model. Adapters never apply a sign meaning
 * (D-43): rows carry a magnitude, a marker and the raw original text, and it
 * is the format profile (`FormatProfile`, decided in engine/statement/profile
 * per D-41) that later converts them to the app's one stored-sign rule
 * (D-44). This file is types (plus one tiny pure function) only -- no I/O,
 * no parsing, so every downstream stage imports its shapes from here rather
 * than defining its own.
 */
import type { AmountMarker, MinorUnits } from '../money';

export type ImportSource = 'csv' | 'ofx'; // QFX is 'ofx' (D-39); the 'qfx' literal exists only in analytics

export type AccountKind = 'cash' | 'checking' | 'savings' | 'credit' | 'investment' | 'loan' | 'other';
export type AccountFamily = 'deposit' | 'card' | 'loan';

export function accountFamilyOf(kind: AccountKind): AccountFamily {
  if (kind === 'credit') return 'card';
  if (kind === 'loan') return 'loan';
  return 'deposit';
}

export type DraftRowIssue =
  | 'bad-date'
  | 'bad-amount'
  | 'zero-amount'
  | 'empty-description'
  | 'unknown-currency'
  | 'amount-too-large'
  | 'conflicting-markers'
  | 'bad-balance';

export interface DraftRow {
  index: number; // 0-based, file order, after summary lines are removed
  localDate: string | null; // 'YYYY-MM-DD'
  description: string; // raw bank text, whitespace-collapsed, <= 200 chars (D-20)
  magnitude: MinorUnits | null; // >= 0; null when unreadable
  marker: AmountMarker; // notation only (D-43)
  rawAmount: string | null; // trimmed original cell text, <= 64 chars (D-45)
  balanceMagnitude: MinorUnits | null;
  balanceMarker: AmountMarker;
  rawBalance: string | null; // <= 64 chars (D-45)
  currency: string; // upper-case code
  externalId: string | null; // OFX FITID, <= 255 chars (D-39, D-54)
  trnType: string | null; // OFX TRNTYPE upper-case, or a CSV type-column value mapped to 'DEBIT'/'CREDIT'
  issues: DraftRowIssue[];
}

export interface StatedBalance {
  magnitude: MinorUnits;
  marker: AmountMarker;
  asOf: string | null;
  raw: string;
}

export type LabelEvidence =
  | 'debit-credit-columns'
  | 'direction-column'
  | 'dr-cr-markers'
  | 'available-balance-label'
  | 'owed-balance-label'
  | 'held-balance-label'
  | 'limit-label'
  | 'od-marker';

export type DraftWarning = 'malformed-close' | 'unclosed-aggregate' | 'mixed-grouping' | 'summary-lines-removed';

export interface StatementDraft {
  source: ImportSource;
  layoutSignature: string; // <= 500 chars; header/decimal/delimiter or 'ofx|bank|CHECKING'; never an account number
  accountHint: 'bank' | 'card' | null;
  currency: string | null; // CURDEF or null (use the target account's currency, D-12)
  rows: DraftRow[];
  statedOpening: StatedBalance | null;
  statedClosing: StatedBalance | null; // OFX LEDGERBAL lands here
  available: StatedBalance | null; // OFX AVAILBAL
  statedLimit: MinorUnits | null;
  balanceLabel: 'held' | 'owed' | 'available' | null;
  labels: LabelEvidence[];
  periodStart: string | null;
  periodEnd: string | null;
  warnings: DraftWarning[];
}

export type ProfileEvidence =
  | 'account-kind'
  | 'debit-credit-columns'
  | 'direction-column'
  | 'dr-cr-markers'
  | 'payment-row-sign'
  | 'income-row-sign'
  | 'running-balance'
  | 'trntype-agrees'
  | 'available-label'
  | 'owed-label'
  | 'remembered'
  | 'majority-sign-prior';

export interface FormatProfile {
  version: 1;
  source: ImportSource;
  accountFamily: AccountFamily; // fixed by the target account (D-53)
  positiveMeans: 'money-in' | 'money-spent'; // s
  balanceMeans: 'held' | 'owed' | 'available' | 'none'; // k (+ available), fixed by account kind + labels (D-53)
  statedLimit: MinorUnits | null; // offered to the user, never auto-applied (D-48)
  decidedBy: 'labels' | 'reconciliation' | 'remembered' | 'user';
}

export type ProfileResult =
  | { kind: 'decided'; profile: FormatProfile; evidence: ProfileEvidence[] }
  | { kind: 'ambiguous'; candidates: FormatProfile[]; evidence: ProfileEvidence[] };

export const MAX_RAW_CELL = 64;
export const MAX_DESCRIPTION = 200;
export const MAX_EXTERNAL_ID = 255;
export const MAX_LAYOUT_SIGNATURE = 500;
