/**
 * Wise export reader. Column layout from RESEARCH Pattern 12 (LOW confidence);
 * finalised against the owner's real export in plan 10-28 (D-24).
 * Payer, payee, account number and card columns are never read.
 */
import { assemble, runReader, type DateFormat } from './common';
import type { WalletRead } from './types';

// dd-MM-yyyy
export const WISE_DATE: DateFormat = { re: /^(\d{1,2})-(\d{1,2})-(\d{4})/, order: [3, 2, 1] };

const REQUIRED = ['TransferWise ID', 'Date', 'Amount', 'Currency', 'Description'];

export function readWise(rows: string[][]): WalletRead {
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
      balanceRaw: get('Running Balance'),
      description: get('Description'),
      // A conversion's id is shared by its two currency lines, so the line id carries the currency
      externalId: id === '' ? null : conversion ? `${id}|${currency}` : id,
      pairKey: conversion && id !== '' ? id : null,
      conversion,
    });
  });
}
