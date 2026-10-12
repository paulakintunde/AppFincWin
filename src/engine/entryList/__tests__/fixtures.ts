import type { ListItem } from '../model';

let n = 0;
export function mk(over: Partial<ListItem> = {}): ListItem {
  n += 1;
  return {
    id: `i${n}`,
    type: 'out',
    amountMinor: 1000,
    currency: 'GBP',
    accountId: 'a1',
    localDate: '2026-10-12',
    name: 'Coffee',
    categoryId: null,
    paymentType: null,
    status: 'paid',
    statusTouched: false,
    note: '',
    automatic: false,
    refund: false,
    repeat: { freq: 'never' },
    toAccountId: null,
    toCurrency: null,
    amountInMinor: null,
    ...over,
  };
}

export function mkTransfer(over: Partial<ListItem> = {}): ListItem {
  return mk({ type: 'transfer', name: '', toAccountId: 'a2', ...over });
}
