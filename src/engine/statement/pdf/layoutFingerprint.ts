// D-14: the only record of an unreadable statement is this anonymous fingerprint.
// The builder takes no free-form input at all, so nothing read from a statement can reach it:
// a failed step, a page-count band and which column roles were found. There is deliberately no
// issuer field either: recognising an issuer would need per-issuer templates, and none exist (D-18).
import type { ColumnRole } from './layout';

export interface LayoutFingerprint {
  failedStep: 'no_text_layer' | 'no_table' | 'no_rows';
  pages: '1' | '2-5' | '6-10' | '11-25';
  hasDate: boolean;
  hasDescription: boolean;
  hasAmount: boolean;
  hasDebitCredit: boolean;
  hasBalance: boolean;
}

export function pageBand(pageCount: number): LayoutFingerprint['pages'] {
  if (pageCount <= 1) return '1';
  if (pageCount <= 5) return '2-5';
  if (pageCount <= 10) return '6-10';
  return '11-25';
}

export function buildLayoutFingerprint(input: {
  failedStep: LayoutFingerprint['failedStep'];
  pageCount: number;
  roles: readonly ColumnRole[];
}): LayoutFingerprint {
  const has = (r: ColumnRole): boolean => input.roles.includes(r);
  return {
    failedStep: input.failedStep,
    pages: pageBand(input.pageCount),
    hasDate: has('date'),
    hasDescription: has('description'),
    hasAmount: has('amount'),
    hasDebitCredit: has('debit') && has('credit'),
    hasBalance: has('balance'),
  };
}
