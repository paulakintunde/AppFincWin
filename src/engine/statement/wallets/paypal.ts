/**
 * PayPal activity export reader. Column layout from RESEARCH Pattern 12 (LOW
 * confidence); finalised against the owner's real export in plan 10-28 (D-24).
 * The Name and email columns are never read; the description is the item title
 * when present, otherwise the transaction type.
 */
import { assemble, runReader, type DateFormat } from './common';
import type { WalletRead } from './types';

// MM/DD/YYYY
export const PAYPAL_DATE: DateFormat = { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, order: [3, 1, 2] };

const REQUIRED = ['Date', 'Type', 'Status', 'Currency', 'Gross', 'Fee', 'Net', 'Transaction ID'];

export function readPayPal(rows: string[][]): WalletRead {
  return runReader('paypal', rows, REQUIRED, (get) => {
    if (get('Status').toLowerCase() !== 'completed') return 'skip';
    if (get('Balance Impact').toLowerCase() === 'memo') return 'skip';
    const type = get('Type');
    const conversion = type.toLowerCase() === 'general currency conversion';
    const ref = get('Reference Txn ID');
    const id = get('Transaction ID');
    return assemble({
      currency: get('Currency'),
      dateRaw: get('Date'),
      dateFormat: PAYPAL_DATE,
      amountRaw: get('Gross'),
      feeRaw: get('Fee'),
      balanceRaw: get('Balance'),
      description: get('Item Title') || type,
      externalId: id === '' ? null : id,
      pairKey: conversion && ref !== '' ? ref : null,
      conversion,
    });
  });
}
