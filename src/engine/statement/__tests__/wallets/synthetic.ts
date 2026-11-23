/**
 * Synthetic wallet CSV builders following the RESEARCH Pattern 12 headers.
 * Every row carries sentinel personal data that no reader may copy.
 */

export const SENTINELS = ['SENTINEL-NAME-55', 'sentinel@example.com', 'GB00SENT1NEL', '4242'] as const;

function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function csv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n') + '\n';
}

export const WISE_HEADER = [
  'TransferWise ID', 'Date', 'Amount', 'Currency', 'Description', 'Payment Reference', 'Running Balance',
  'Exchange From', 'Exchange To', 'Exchange Rate', 'Payer Name', 'Payee Name', 'Payee Account Number',
  'Merchant', 'Card Last Four Digits', 'Card Holder Full Name', 'Attachment', 'Note', 'Total fees',
] as const;

export interface WiseRow {
  id?: string; date?: string; amount?: string; currency?: string; description?: string; balance?: string;
  from?: string; to?: string; fees?: string;
}

export function wiseRow(r: WiseRow): string[] {
  return [
    r.id ?? 'CARD-1', r.date ?? '05-03-2026', r.amount ?? '-10.00', r.currency ?? 'EUR', r.description ?? 'Coffee shop',
    'ref', r.balance ?? '', r.from ?? '', r.to ?? '', '', 'SENTINEL-NAME-55', 'SENTINEL-NAME-55', 'GB00SENT1NEL',
    'SENTINEL-NAME-55', '4242', 'SENTINEL-NAME-55', '', 'sentinel@example.com', r.fees ?? '',
  ];
}

export const REVOLUT_HEADER = [
  'Type', 'Product', 'Started Date', 'Completed Date', 'Description', 'Amount', 'Fee', 'Currency', 'State', 'Balance',
] as const;

export interface RevolutRow {
  type?: string; date?: string; description?: string; amount?: string; fee?: string; currency?: string;
  state?: string; balance?: string;
}

export function revolutRow(r: RevolutRow): string[] {
  const date = r.date ?? '2026-03-05 10:15:00';
  return [
    r.type ?? 'CARD_PAYMENT', 'Current', date, date, r.description ?? 'Bakery', r.amount ?? '-12.50',
    r.fee ?? '0.00', r.currency ?? 'EUR', r.state ?? 'COMPLETED', r.balance ?? '',
  ];
}

export const PAYPAL_HEADER = [
  'Date', 'Time', 'TimeZone', 'Name', 'Type', 'Status', 'Currency', 'Gross', 'Fee', 'Net', 'From Email Address',
  'To Email Address', 'Transaction ID', 'Item Title', 'Reference Txn ID', 'Balance', 'Balance Impact',
] as const;

export interface PayPalRow {
  date?: string; type?: string; status?: string; currency?: string; gross?: string; fee?: string; net?: string;
  id?: string; item?: string; ref?: string; balance?: string; impact?: string;
}

export function paypalRow(r: PayPalRow): string[] {
  return [
    r.date ?? '03/05/2026', '10:15:00', 'PST', 'SENTINEL-NAME-55', r.type ?? 'Express Checkout Payment',
    r.status ?? 'Completed', r.currency ?? 'USD', r.gross ?? '-50.00', r.fee ?? '-1.75', r.net ?? '-51.75',
    'sentinel@example.com', 'sentinel@example.com', r.id ?? 'TX-1', r.item ?? '', r.ref ?? '', r.balance ?? '',
    r.impact ?? 'Debit',
  ];
}
