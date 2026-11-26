/**
 * Header-signature detection ahead of the generic column matcher (D-21). A file
 * that is not a known wallet returns null so the existing import runs.
 */
import { tokenize } from '../../csv/tokenize';
import { norm } from './common';
import { readPayPal } from './paypal';
import { readRevolut } from './revolut';
import { readWise } from './wise';
import type { WalletKind, WalletRead } from './types';

// Distinctive columns only; a reader reports any other missing column itself
const SIGNATURES: ReadonlyArray<readonly [WalletKind, readonly string[]]> = [
  ['wise', ['transferwise id']],
  ['revolut', ['started date', 'completed date', 'state']],
  ['paypal', ['gross', 'fee', 'net', 'transaction id']],
];

export function detectWallet(header: readonly string[]): WalletKind | null {
  const cols = new Set(header.map(norm));
  const hit = SIGNATURES.find(([, needed]) => needed.every((c) => cols.has(c)));
  return hit === undefined ? null : hit[0];
}

/** null = not a known wallet, so the generic column-matching import runs. */
export function readWallet(text: string): WalletRead | null {
  const t = tokenize(text);
  if (!t.ok) return null;
  const kind = detectWallet(t.rows[0] as string[]);
  if (kind === 'wise') return readWise(t.rows);
  if (kind === 'revolut') return readRevolut(t.rows);
  if (kind === 'paypal') return readPayPal(t.rows);
  return null;
}
