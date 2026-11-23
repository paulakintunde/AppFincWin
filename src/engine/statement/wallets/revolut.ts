/**
 * Revolut personal export reader. Column layout from RESEARCH Pattern 12
 * (LOW confidence); finalised against the owner's real export in plan 10-28 (D-24).
 */
import { assemble, runReader, type DateFormat } from './common';
import type { WalletRead } from './types';

// YYYY-MM-DD HH:MM:SS (the time is ignored)
export const REVOLUT_DATE: DateFormat = { re: /^(\d{4})-(\d{2})-(\d{2})/, order: [1, 2, 3] };

const REQUIRED = ['Type', 'Completed Date', 'Description', 'Amount', 'Fee', 'Currency', 'State'];

export function readRevolut(rows: string[][]): WalletRead {
  return runReader('revolut', rows, REQUIRED, (get) => {
    if (get('State').toUpperCase() !== 'COMPLETED') return 'skip';
    const conversion = get('Type').toUpperCase() === 'EXCHANGE';
    return assemble({
      currency: get('Currency'),
      dateRaw: get('Completed Date'),
      dateFormat: REVOLUT_DATE,
      amountRaw: get('Amount'),
      feeRaw: get('Fee'),
      balanceRaw: get('Balance'),
      description: get('Description'),
      externalId: null,
      // Both currency lines of an exchange share the completion timestamp
      pairKey: conversion ? get('Completed Date') : null,
      conversion,
    });
  });
}
