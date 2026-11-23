import { detectWallet, readWallet } from '../../wallets';
import {
  csv, PAYPAL_HEADER, paypalRow, REVOLUT_HEADER, revolutRow, WISE_HEADER, wiseRow,
} from './synthetic';

describe('detectWallet', () => {
  it('recognises each researched header', () => {
    expect(detectWallet(WISE_HEADER)).toBe('wise');
    expect(detectWallet(REVOLUT_HEADER)).toBe('revolut');
    expect(detectWallet(PAYPAL_HEADER)).toBe('paypal');
  });

  it('returns null for a bank header', () => {
    expect(detectWallet(['Date', 'Description', 'Amount'])).toBeNull();
  });

  it('ignores case, BOM and extra trailing columns', () => {
    expect(detectWallet(['﻿TYPE', ' started date ', 'COMPLETED DATE', 'state', 'extra', 'more'])).toBe('revolut');
  });
});

describe('readWallet', () => {
  it('returns null for text that is not a known wallet', () => {
    expect(readWallet('Date,Description,Amount\n2026-01-01,Shop,-5.00\n')).toBeNull();
  });

  it('returns null when the file cannot be tokenised', () => {
    expect(readWallet('')).toBeNull();
  });

  it('routes each wallet to its reader', () => {
    expect(readWallet(csv(WISE_HEADER, [wiseRow({})]))).toMatchObject({ ok: true, wallet: 'wise' });
    expect(readWallet(csv(REVOLUT_HEADER, [revolutRow({})]))).toMatchObject({ ok: true, wallet: 'revolut' });
    expect(readWallet(csv(PAYPAL_HEADER, [paypalRow({})]))).toMatchObject({ ok: true, wallet: 'paypal' });
  });
});
