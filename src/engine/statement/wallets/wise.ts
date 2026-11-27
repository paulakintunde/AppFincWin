/**
 * Wise export reader. Column layout from RESEARCH Pattern 12 (LOW confidence);
 * finalised against the owner's real export in plan 10-28 (D-24).
 * Payer, payee, account number and card columns are never read.
 * 10-review (D-3): Wise's Amount is usually the whole balance change, fee included. The file's Running Balance decides
 * per file whether Total fees is already inside Amount; with no evidence, Amount is taken as fee-inclusive, and the fee
 * is split out of it rather than taken off a second time.
 */
import { assemble, norm, parseMoney, runReader, type DateFormat } from './common';
import type { WalletRead } from './types';

// dd-MM-yyyy
export const WISE_DATE: DateFormat = { re: /^(\d{1,2})-(\d{1,2})-(\d{4})/, order: [3, 2, 1] };

const REQUIRED = ['TransferWise ID', 'Date', 'Amount', 'Currency', 'Description'];

interface Probe {
  currency: string;
  amount: number;
  fee: number;
  balance: number;
}

/**
 * 10-review (D-3): reads adjacent rows of one currency (either file order, since exports run newest or oldest first)
 * and counts which reading makes balances add up: previous balance + Amount (fee-inclusive) or + Amount - fee.
 * Rows without a fee carry no evidence either way.
 */
export function wiseFeeIncluded(rows: readonly string[][]): boolean {
  const header = (rows[0] as string[]).map(norm);
  const at = ['Currency', 'Amount', 'Total fees', 'Running Balance'].map((name) => header.indexOf(norm(name)));
  // A missing column leaves no evidence (runReader reports a missing required column itself).
  if (at.some((i) => i < 0)) return true;
  const [ci, ai, fi, bi] = at as [number, number, number, number];
  let inclusive = 0;
  let exclusive = 0;
  const vote = (row: Probe, change: number) => {
    if (row.fee === 0) return;
    if (change === row.amount) inclusive += 1;
    else if (change === row.amount - row.fee) exclusive += 1;
  };
  const last = new Map<string, Probe>();
  for (const cells of rows.slice(1)) {
    const currency = (cells[ci] as string).trim().toUpperCase();
    // A blank fee is no fee; a blank or unreadable cell makes the row no evidence.
    const [amount, fee, balance] = [ai, fi, bi].map((i) => parseMoney((cells[i] as string).trim() || '0', currency));
    if ((cells[bi] as string).trim() === '' || [amount, fee, balance].includes(null)) continue;
    const p: Probe = { currency, amount: amount as number, fee: Math.abs(fee as number), balance: balance as number };
    const prev = last.get(currency);
    if (prev !== undefined) {
      vote(p, p.balance - prev.balance); // oldest first: this row moved the balance from prev
      vote(prev, prev.balance - p.balance); // newest first: prev moved the balance from this row
    }
    last.set(currency, p);
  }
  return exclusive <= inclusive;
}

export function readWise(rows: string[][]): WalletRead {
  const feeIncluded = wiseFeeIncluded(rows);
  return runReader('wise', rows, REQUIRED, (get) => {
    if (get('Amount') === '') return 'skip';
    const id = get('TransferWise ID');
    const currency = get('Currency').toUpperCase();
    const conversion = get('Exchange From') !== '' && get('Exchange To') !== '';
    return assemble({
      currency,
      dateRaw: get('Date'),
      dateFormat: WISE_DATE,
      amountRaw: get('Amount'),
      feeRaw: get('Total fees'),
      feeIncluded,
      balanceRaw: get('Running Balance'),
      description: get('Description'),
      // A conversion's id is shared by its two currency lines, so the line id carries the currency
      externalId: id === '' ? null : conversion ? `${id}|${currency}` : id,
      pairKey: conversion && id !== '' ? id : null,
      conversion,
    });
  });
}
