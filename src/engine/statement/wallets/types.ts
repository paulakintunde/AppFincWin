/**
 * Wallet statement readers (IMP-06, D-21..D-23): shapes only. A wallet file
 * (PayPal, Wise, Revolut) is read into signed gross / fee / net lines, then
 * turned into one StatementDraft per currency plus fee lines and transfer
 * pairs. Pure engine code: integer minor units, no I/O.
 */
import type { StatementDraft } from '../types';

export type WalletKind = 'paypal' | 'wise' | 'revolut';

export interface WalletLine {
  index: number; // 0-based data-row position in the file; unique per file
  currency: string; // upper-case ISO code
  localDate: string; // 'YYYY-MM-DD'
  description: string; // merchant/description cell only, never payer, payee, email, account or card digits
  grossMinor: number; // signed, outflow negative
  // 10-review (D-2): signed fee cost. > 0 a fee charged (reduces the balance); < 0 a fee returned (adds to it).
  feeMinor: number;
  netMinor: number; // grossMinor - feeMinor: the line's whole balance change
  /** 10-review (D-2): the file's own Net does not equal gross less the fee; the line is flagged, never corrected. */
  netMismatch?: true;
  externalId: string | null;
  pairKey: string | null;
  kind: 'payment' | 'conversion' | 'fee-only';
  balanceMinor: number | null; // the wallet's own running balance after the line, signed
}

export type WalletReadError = 'missing-column' | 'unreadable';

export type WalletRead =
  | { ok: true; wallet: WalletKind; lines: WalletLine[]; skipped: number }
  | { ok: false; wallet: WalletKind; error: WalletReadError; missing?: string[] };

/** An expense in the "Fees" category tied to one wallet line, or (10-review D-2) a returned fee, which adds money back. */
export interface WalletFeeLine {
  forIndex: number; // WalletLine.index
  currency: string;
  localDate: string;
  magnitude: number; // > 0
  returned: boolean;
}

/** A currency conversion's two lines as one linked transfer. */
export interface WalletTransferPair {
  fromIndex: number;
  toIndex: number;
  fromCurrency: string;
  toCurrency: string;
  feeIndex: number | null; // WalletLine.index of the line whose fee belongs to this conversion
}

export interface WalletDrafts {
  wallet: WalletKind;
  drafts: StatementDraft[]; // one per currency, DraftRow.index = WalletLine.index
  feeLines: WalletFeeLine[];
  transferPairs: WalletTransferPair[];
  currencies: string[]; // sorted
}
